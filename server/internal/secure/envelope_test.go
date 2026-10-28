package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"path/filepath"
	"testing"
	"time"
)

// seal mimics the client side of the protocol.
func seal(t *testing.T, k *Keys, msg []byte) (Envelope, cipher.AEAD) {
	t.Helper()
	eph, _ := ecdh.P256().GenerateKey(rand.Reader)
	srv, _ := ecdh.P256().NewPublicKey(k.pub)
	shared, _ := eph.ECDH(srv)
	epk := eph.PublicKey().Bytes()
	salt := append(append([]byte{}, epk...), k.pub...)
	mk := func(info string) cipher.AEAD {
		key, _ := hkdf.Key(sha256.New, shared, salt, info, 32)
		b, _ := aes.NewCipher(key)
		g, _ := cipher.NewGCM(b)
		return g
	}
	nonce := make([]byte, 12)
	rand.Read(nonce)
	ct := mk(infoReq).Seal(nil, nonce, msg, []byte("gp1|"+k.KID))
	return Envelope{V: 1, KID: k.KID, K: b64.EncodeToString(epk), N: b64.EncodeToString(nonce), C: b64.EncodeToString(ct)}, mk(infoRes)
}

func TestRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "k")
	k, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	again, err := LoadOrCreate(path)
	if err != nil || again.KID != k.KID {
		t.Fatal("key not persisted")
	}

	env, res := seal(t, k, []byte("hello"))
	pt, sess, err := k.Open(env)
	if err != nil || string(pt) != "hello" {
		t.Fatalf("open: %v %q", err, pt)
	}
	r := sess.Seal([]byte("world"))
	n, _ := b64.DecodeString(r.N)
	c, _ := b64.DecodeString(r.C)
	out, err := res.Open(nil, n, c, []byte("gp1|"+k.KID+"|res"))
	if err != nil || string(out) != "world" {
		t.Fatalf("reply: %v %q", err, out)
	}

	env.C = env.C[:len(env.C)-2] + "AA"
	if _, _, err := k.Open(env); err == nil {
		t.Fatal("tampered envelope accepted")
	}
}

func TestReplay(t *testing.T) {
	g := NewReplayGuard(time.Minute)
	now := time.Now()
	if !g.Accept("a", now) || g.Accept("a", now) {
		t.Fatal("duplicate id accepted")
	}
	if g.Accept("b", now.Add(-2*time.Minute)) {
		t.Fatal("stale request accepted")
	}
}
