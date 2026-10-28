// Client side of the encrypted envelope (see server/internal/secure).
// ECDH P-256 with a fresh key per request, HKDF-SHA256, AES-256-GCM.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

final _curve = ECCurve_secp256r1();

SecureRandom _secureRandom() {
  final seed = Random.secure();
  return FortunaRandom()..seed(KeyParameter(Uint8List.fromList(List.generate(32, (_) => seed.nextInt(256)))));
}

final SecureRandom _rng = _secureRandom();

Uint8List randomBytes(int n) => _rng.nextBytes(n);

String b64u(List<int> b) => base64Url.encode(b).replaceAll('=', '');

Uint8List unb64u(String s) => base64Url.decode(s.padRight((s.length + 3) & ~3, '='));

Uint8List _bigIntTo32(BigInt v) {
  final out = Uint8List(32);
  var x = v;
  for (var i = 31; i >= 0; i--) {
    out[i] = (x & BigInt.from(0xff)).toInt();
    x = x >> 8;
  }
  return out;
}

Uint8List _hkdf(Uint8List ikm, Uint8List salt, String info) {
  final d = HKDFKeyDerivator(SHA256Digest())..init(HkdfParameters(ikm, 32, salt, Uint8List.fromList(utf8.encode(info))));
  final out = Uint8List(32);
  d.deriveKey(null, 0, out, 0);
  return out;
}

Uint8List _gcm(bool encrypt, Uint8List key, Uint8List nonce, Uint8List aad, Uint8List data) {
  final c = GCMBlockCipher(AESEngine())..init(encrypt, AEADParameters(KeyParameter(key), 128, nonce, aad));
  return c.process(data);
}

class ServerKey {
  ServerKey(this.kid, this.raw) : point = ECPublicKey(_curve.curve.decodePoint(raw), _curve);
  final String kid;
  final Uint8List raw;
  final ECPublicKey point;
}

/// One sealed request plus the key needed to open its reply.
class Sealed {
  Sealed(this.body, this._resKey, this._kid);
  final Map<String, dynamic> body;
  final Uint8List _resKey;
  final String _kid;

  /// Throws if the reply was tampered with.
  Uint8List open(String nonce, String ct) =>
      _gcm(false, _resKey, unb64u(nonce), Uint8List.fromList(utf8.encode('gp1|$_kid|res')), unb64u(ct));
}

Sealed seal(ServerKey sk, Uint8List plain) {
  final gen = ECKeyGenerator()..init(ParametersWithRandom(ECKeyGeneratorParameters(_curve), _rng));
  final pair = gen.generateKeyPair();
  final priv = pair.privateKey;
  final epk = pair.publicKey.Q!.getEncoded(false);
  final shared = _bigIntTo32((ECDHBasicAgreement()..init(priv)).calculateAgreement(sk.point));
  final salt = Uint8List.fromList([...epk, ...sk.raw]);
  final reqKey = _hkdf(shared, salt, 'goprofile/v1/req');
  final resKey = _hkdf(shared, salt, 'goprofile/v1/res');
  final nonce = randomBytes(12);
  final ct = _gcm(true, reqKey, nonce, Uint8List.fromList(utf8.encode('gp1|${sk.kid}')), plain);
  return Sealed({'v': 1, 'kid': sk.kid, 'k': b64u(epk), 'n': b64u(nonce), 'c': b64u(ct)}, resKey, sk.kid);
}
