// Package secure implements the encrypted request envelope used by every API call.
//
// Each request carries a fresh client ECDH P-256 public key. Both sides derive
// separate AES-256-GCM keys for the request and the response with HKDF-SHA256
// over the shared secret, so a captured message cannot be read without the
// server private key, and old traffic stays safe if a client key leaks.
package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	Alg     = "ECDH-P256+HKDF-SHA256+A256GCM"
	infoReq = "goprofile/v1/req"
	infoRes = "goprofile/v1/res"
)

var b64 = base64.RawURLEncoding

var ErrEnvelope = errors.New("invalid envelope")

type Keys struct {
	priv *ecdh.PrivateKey
	pub  []byte
	KID  string
}

// LoadOrCreate reads the server private key, creating it with 0600 permissions on first run.
func LoadOrCreate(path string) (*Keys, error) {
	raw, err := os.ReadFile(path)
	var priv *ecdh.PrivateKey
	switch {
	case err == nil:
		b, derr := hex.DecodeString(strings.TrimSpace(string(raw)))
		if derr != nil {
			return nil, fmt.Errorf("key file: %w", derr)
		}
		if priv, err = ecdh.P256().NewPrivateKey(b); err != nil {
			return nil, fmt.Errorf("key file: %w", err)
		}
	case errors.Is(err, os.ErrNotExist):
		if priv, err = ecdh.P256().GenerateKey(rand.Reader); err != nil {
			return nil, err
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, []byte(hex.EncodeToString(priv.Bytes())), 0o600); err != nil {
			return nil, err
		}
	default:
		return nil, err
	}
	pub := priv.PublicKey().Bytes()
	sum := sha256.Sum256(pub)
	return &Keys{priv: priv, pub: pub, KID: hex.EncodeToString(sum[:8])}, nil
}

func (k *Keys) Public() string { return b64.EncodeToString(k.pub) }

type Envelope struct {
	V   int    `json:"v"`
	KID string `json:"kid"`
	K   string `json:"k"`
	N   string `json:"n"`
	C   string `json:"c"`
}

type Reply struct {
	N string `json:"n"`
	C string `json:"c"`
}

// Session holds the response key for one request.
type Session struct {
	res cipher.AEAD
	kid string
}

// Open decrypts a request envelope and returns its plaintext and a session for the reply.
func (k *Keys) Open(e Envelope) ([]byte, *Session, error) {
	if e.V != 1 || e.KID != k.KID {
		return nil, nil, ErrEnvelope
	}
	epk, err1 := b64.DecodeString(e.K)
	nonce, err2 := b64.DecodeString(e.N)
	ct, err3 := b64.DecodeString(e.C)
	if err1 != nil || err2 != nil || err3 != nil || len(nonce) != 12 {
		return nil, nil, ErrEnvelope
	}
	peer, err := ecdh.P256().NewPublicKey(epk)
	if err != nil {
		return nil, nil, ErrEnvelope
	}
	shared, err := k.priv.ECDH(peer)
	if err != nil {
		return nil, nil, ErrEnvelope
	}
	salt := append(append([]byte{}, epk...), k.pub...)
	req, err := aead(shared, salt, infoReq)
	if err != nil {
		return nil, nil, err
	}
	res, err := aead(shared, salt, infoRes)
	if err != nil {
		return nil, nil, err
	}
	pt, err := req.Open(nil, nonce, ct, []byte("gp1|"+k.KID))
	if err != nil {
		return nil, nil, ErrEnvelope
	}
	return pt, &Session{res: res, kid: k.KID}, nil
}

// Seal encrypts the response body with a fresh nonce.
func (s *Session) Seal(pt []byte) Reply {
	nonce := make([]byte, 12)
	rand.Read(nonce)
	ct := s.res.Seal(nil, nonce, pt, []byte("gp1|"+s.kid+"|res"))
	return Reply{N: b64.EncodeToString(nonce), C: b64.EncodeToString(ct)}
}

func aead(secret, salt []byte, info string) (cipher.AEAD, error) {
	key, err := hkdf.Key(sha256.New, secret, salt, info, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
