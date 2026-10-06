package com.itechdp.yokohama;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

// Device-bound signing key for login device-binding. The private key is
// generated inside the AndroidKeyStore (hardware-backed where available) and
// never leaves it - it cannot be exported, read, or copied, even by this
// app's own code. Only the public key (not secret) and signatures over
// server-issued challenges ever cross the JS bridge.
@CapacitorPlugin(name = "DeviceKeystore")
public class DeviceKeystorePlugin extends Plugin {

    private static final String ALIAS = "yokohama_device_key";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";

    @PluginMethod
    public void hasKey(PluginCall call) {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            JSObject result = new JSObject();
            result.put("hasKey", keyStore.containsAlias(ALIAS));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to check for device key: " + e.getMessage(), e);
        }
    }

    // Idempotent: generates the key pair only if it doesn't already exist,
    // then returns the (possibly pre-existing) public key either way.
    @PluginMethod
    public void generateKeyPair(PluginCall call) {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);

            if (!keyStore.containsAlias(ALIAS)) {
                KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                        .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(false)
                        .build();

                KeyPairGenerator generator = KeyPairGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_PROVIDER);
                generator.initialize(spec);
                KeyPair keyPair = generator.generateKeyPair();
                PublicKey publicKey = keyPair.getPublic();
                call.resolve(publicKeyResult(publicKey));
                return;
            }

            PublicKey publicKey = keyStore.getCertificate(ALIAS).getPublicKey();
            call.resolve(publicKeyResult(publicKey));
        } catch (Exception e) {
            call.reject("Failed to generate device key: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Missing required parameter: data");
            return;
        }

        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);

            if (!keyStore.containsAlias(ALIAS)) {
                call.reject("No device key exists - call generateKeyPair first");
                return;
            }

            PrivateKey privateKey = (PrivateKey) keyStore.getKey(ALIAS, null);

            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(privateKey);
            signature.update(data.getBytes("UTF-8"));
            byte[] signatureBytes = signature.sign();

            JSObject result = new JSObject();
            result.put("signature", Base64.encodeToString(signatureBytes, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to sign challenge: " + e.getMessage(), e);
        }
    }

    private JSObject publicKeyResult(PublicKey publicKey) {
        JSObject result = new JSObject();
        result.put("publicKey", Base64.encodeToString(publicKey.getEncoded(), Base64.NO_WRAP));
        return result;
    }
}
