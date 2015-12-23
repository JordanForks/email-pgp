let hexkid = (k) => k.toString('hex');

class HKP {
  constructor(keyServerBaseUrl, fetch) {
    this._baseUrl = keyServerBaseUrl ? keyServerBaseUrl : 'https://pgp.mit.edu';
    this._fetch = fetch ? fetch : typeof window !== 'undefined' && window.fetch;

    this.lookup = this.lookup.bind(this);
  }

  lookup(options) {
    var uri = this._baseUrl + '/pks/lookup?op=get&options=mr&search=';

    // Really obsure bug here. If we replace fetch(url) later, Electron throws
    // an "Illegal invocation error" unless we unwrap the variable here.
    var fetch = this._fetch;

    if (options.keyId) {
      uri += '0x' + options.keyId;
    } else if (options.query) {
      uri += options.query;
    } else {
      throw new Error('You must provide a query parameter!');
    }

    return fetch(uri).then((response) => {
      return response.text();
    }).then((publicKeyArmored) => {
      if (publicKeyArmored && publicKeyArmored.indexOf('-----END PGP PUBLIC KEY BLOCK-----') > -1) {
        return publicKeyArmored.trim();
      }
    });
  }
}

// Adapted from PgpKeyRing in kbpgp
class KeyStore {
  constructor() {
    this._keys = {};
    this._kms = {};

    this._hkp = new HKP();

    this.addKeyManager = this.addKeyManager.bind(this);
    this.fetchRemotePublicKey = this.fetchRemotePublicKey.bind(this);
    this.fetch = this.fetch.bind(this);
    this.findBestKey = this.findBestKey.bind(this);
    this.lookup = this.lookup.bind(this);
  }

  addKeyManager(km) {
    let keys = km.export_pgp_keys_to_keyring();
    for (var i = 0, _len = keys.length; i < _len; i++) {
      let k = keys[i];
      let kid = hexkid(k.key_material.get_key_id());
      this._keys[kid] = k;
      this._kms[kid] = km;
    }
  }

  fetchRemotePublicKey(keyId) {
    return this._hkp.lookup({ keyId }).then((publicKeyArmored) => {
      return Promise.promisify(kbpgp.KeyManager.import_from_armored_pgp)({
        armored: publicKeyArmored
      });
    });
  }

  fetch(key_ids, ops, cb) {
    var ret_i;
    var key_material = err = obj = km = null;

    key_ids = (() => {
      var _results = [];
      for (var _i = 0, _len = key_ids.length; _i < _len; _i++) {
        _results.push(hexkid(key_ids[_i]));
      }
      return _results;
    })();

    console.log(key_ids);

    for (var _i = 0, _len = key_ids.length; _i < _len; _i++) {
      let id = key_ids[_i];
      let k = this._keys[id];
      if (k != null ? (_ref = k.key) != null ? _ref.can_perform(ops) : void 0 : void 0) {
        ret_i = i;
        km = this._kms[id];
        break;
      }
    }
    if (km == null) {
      err = new Error(`key not found: ${JSON.stringify(key_ids)}`);
    }
    cb(err, km, ret_i);
  }

  // Pick the best key to fill the flags asked for by the flags.
  // See C.openpgp.key_flags for ideas of what the flags might be.
  findBestKey({key_id, flags}, cb) {
    let km = this._kms[(kid = hexkid(key_id))];

    if (km == null) {
      err = new Error("Could not find key for fingerprint " + kid);
    } else if ((key = km.find_best_pgp_key(flags)) == null) {
      err = new Error("no matching key for flags: " + flags);
    }

    cb(err, key);
  }

  lookup(key_id) {
    return this._keys(hexkid(key_id));
  }
}

export default new KeyStore();
