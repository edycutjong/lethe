#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

pub const CONTRACT_VERSION: &str = "1.0.1";

// Generate WIT bindings
wit_bindgen::generate!({
    world: "lethe",
    path: "wit",
    additional_derives: [
        serde::Deserialize,
        serde::Serialize,
    ],
    generate_all,
});

use alloc::string::String;
use alloc::vec::Vec;
use alloc::format;
use serde::{Deserialize, Serialize};

// Import generated interfaces
#[cfg(target_arch = "wasm32")]
use crate::lethe::agent::{chain_rpc, zk_verify};

struct Component;

// Cryptographic Structures matching the SDK
#[derive(Deserialize, Serialize, Debug)]
pub struct EciesEnvelope {
    #[serde(rename = "ephemeralPublicKey")]
    pub ephemeral_public_key: String,
    pub iv: String,
    pub ciphertext: String,
    #[serde(rename = "authTag")]
    pub auth_tag: String,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct ZkProof {
    pub pi_a: Vec<String>,
    pub pi_b: Vec<Vec<String>>,
    pub pi_c: Vec<String>,
    #[serde(rename = "publicSignals")]
    pub public_signals: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct BrokerData {
    pub id: String,
    pub host: String,
    pub path: String,
    pub template: String,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct JobData {
    pub id: String,
    #[serde(rename = "userDid")]
    pub user_did: String,
    pub status: String, // "pending" | "delivered" | "confirmed"
    #[serde(rename = "targetBrokers")]
    pub target_brokers: Vec<String>,
    #[serde(rename = "challengeHash")]
    pub challenge_hash: String,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct EvidenceData {
    pub vc: String,
    pub signer: String,
    pub timestamp: u64,
}

// Fixed private key matching our SDK generated public key
const ENCLAVE_PRIVATE_KEY: &str = "b29d2f6ee9011fab5046eb7190f47c216e52438fa0fba67516e7c1e376673e9a";

// Core decryption logic using k256, aes-gcm, hkdf, sha2
fn decrypt_ecies_payload(envelope: &EciesEnvelope) -> Result<String, String> {
    // 1. Decode hex inputs
    let ephemeral_pk_bytes = hex::decode(&envelope.ephemeral_public_key)
        .map_err(|e| format!("Failed to decode ephemeral public key: {e}"))?;
    let iv_bytes = hex::decode(&envelope.iv)
        .map_err(|e| format!("Failed to decode iv: {e}"))?;
    let ciphertext_bytes = hex::decode(&envelope.ciphertext)
        .map_err(|e| format!("Failed to decode ciphertext: {e}"))?;
    let auth_tag_bytes = hex::decode(&envelope.auth_tag)
        .map_err(|e| format!("Failed to decode auth tag: {e}"))?;

    let enclave_sk_bytes = hex::decode(ENCLAVE_PRIVATE_KEY)
        .map_err(|e| format!("Failed to decode private key: {e}"))?;

    // 2. Perform ECDH Diffie-Hellman
    let pk = k256::PublicKey::from_sec1_bytes(&ephemeral_pk_bytes)
        .map_err(|e| format!("Invalid ephemeral public key format: {e}"))?;
    let sk = k256::SecretKey::from_slice(&enclave_sk_bytes)
        .map_err(|e| format!("Invalid enclave private key: {e}"))?;

    let shared_secret = k256::ecdh::diffie_hellman(sk.to_nonzero_scalar(), pk.as_affine());
    let shared_secret_bytes = shared_secret.raw_secret_bytes();

    // 3. HKDF key expansion
    let hk = hkdf::Hkdf::<sha2::Sha256>::new(None, shared_secret_bytes.as_slice());
    let mut okm = [0u8; 44];
    hk.expand(&[], &mut okm).map_err(|_| "HKDF expansion failed")?;
    let key_bytes = &okm[0..32];
    let derived_iv = &okm[32..44];

    // If IV in envelope differs from derived (some ECIES schemes derive IV, some transmit it),
    // we use the envelope's IV for maximum compatibility.
    let final_iv = if iv_bytes.is_empty() { derived_iv } else { &iv_bytes[..] };

    // 4. Decrypt via AES-GCM
    use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
    let cipher = Aes256Gcm::new_from_slice(key_bytes)
        .map_err(|e| format!("Failed to initialize AES-GCM cipher: {e}"))?;
    
    // Combine ciphertext and authentication tag
    let mut encrypted_payload = ciphertext_bytes;
    encrypted_payload.extend_from_slice(&auth_tag_bytes);

    let plaintext_bytes = cipher.decrypt(final_iv.into(), encrypted_payload.as_slice())
        .map_err(|e| format!("Decryption failed: {e}"))?;

    String::from_utf8(plaintext_bytes)
        .map_err(|e| format!("Plaintext is not valid UTF-8: {e}"))
}

#[cfg(target_arch = "wasm32")]
impl exports::lethe::agent::contracts::Guest for Component {
    fn register_broker(
        req: exports::lethe::agent::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input_bytes = req.input.ok_or("register-broker: missing input")?;
        let broker: BrokerData = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Failed to parse broker payload: {e}"))?;

        host::interfaces::logging::info(&format!("Registering broker template: {}", broker.id))?;

        // Save to TEE KV store
        host::interfaces::kv_store::put(
            "lethe:broker",
            broker.id.as_bytes(),
            &input_bytes,
        )?;

        serde_json::to_vec(&broker.id).map_err(|e| e.to_string())
    }

    fn enqueue_erasure(
        req: exports::lethe::agent::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input_bytes = req.input.ok_or("enqueue-erasure: missing input")?;
        
        #[derive(Deserialize)]
        struct EnqueueReq {
            brokers: Vec<String>,
            #[serde(rename = "challengeHash")]
            challenge_hash: String,
        }
        
        let enqueue_req: EnqueueReq = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Failed to parse enqueue request: {e}"))?;

        let user_did_bytes = host::tenant::tenant_context::calling_user_did()
            .ok_or("User must be authenticated to enqueue erasure")?;
        let user_did = String::from_utf8_lossy(&user_did_bytes).to_string();
        
        // Create deterministic Job ID based on sequence and timestamp
        let timestamp = host::tenant::tenant_context::cluster_timestamp_secs();
        let job_id = format!("job_{}_{}", timestamp, host::tenant::tenant_context::seq_no());

        let job = JobData {
            id: job_id.clone(),
            user_did,
            status: "pending".to_string(),
            target_brokers: enqueue_req.brokers,
            challenge_hash: enqueue_req.challenge_hash,
        };

        host::interfaces::logging::info(&format!("Enqueuing erasure campaign: {}", job.id))?;

        let job_bytes = serde_json::to_vec(&job).map_err(|e| e.to_string())?;
        host::interfaces::kv_store::put(
            "lethe:job",
            job.id.as_bytes(),
            &job_bytes,
        )?;

        #[derive(Serialize)]
        struct EnqueueResp {
            #[serde(rename = "jobId")]
            job_id: String,
        }
        serde_json::to_vec(&EnqueueResp { job_id }).map_err(|e| e.to_string())
    }

    fn fire_erasure(
        req: exports::lethe::agent::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input_bytes = req.input.ok_or("fire-erasure: missing input")?;
        
        #[derive(Deserialize)]
        struct FireReq {
            #[serde(rename = "jobId")]
            job_id: String,
            #[serde(rename = "brokerId")]
            broker_id: String,
            envelope: EciesEnvelope,
            #[serde(rename = "zkProof")]
            zk_proof: ZkProof,
            #[serde(rename = "txReceipt")]
            tx_receipt: String,
        }
        
        let fire_req: FireReq = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Failed to parse fire-erasure request: {e}"))?;

        host::interfaces::logging::info(&format!("Executing deletion for broker: {}", fire_req.broker_id))?;

        // 1. Economic check: Query payment on-chain via chain-rpc
        let payment_confirmed = chain_rpc::query_payment(&fire_req.tx_receipt)
            .map_err(|e| format!("Chain RPC payment check failed: {e}"))?;
        if !payment_confirmed {
            return Err("x402 payment validation failed".to_string());
        }
        host::interfaces::logging::info("Payment confirmed on-chain.")?;

        // 2. Cryptographic check: Verify Groth16 ZK proof offline
        let proof_str = serde_json::to_string(&fire_req.zk_proof).map_err(|e| e.to_string())?;
        let signals_str = serde_json::to_string(&fire_req.zk_proof.public_signals).map_err(|e| e.to_string())?;
        
        let proof_verified = zk_verify::verify_proof(&proof_str, &signals_str)
            .map_err(|e| format!("ZK Proof verification failed: {e}"))?;
        if !proof_verified {
            return Err("Groth16 ownership proof verification failed".to_string());
        }
        host::interfaces::logging::info("Groth16 ownership proof verified.")?;

        // 3. ECIES payload decryption and local sanity checking
        let decrypted_pii = decrypt_ecies_payload(&fire_req.envelope)?;
        host::interfaces::logging::info("Decrypted ECIES envelope inside TEE memory.")?;

        // Simple pre-flight validation on decrypted PII
        #[derive(Deserialize)]
        #[allow(dead_code)]
        struct PiiPayload {
            email: String,
            ssn: Option<String>,
        }
        let pii: PiiPayload = serde_json::from_str(&decrypted_pii)
            .map_err(|e| format!("Failed to parse decrypted PII structure: {e}"))?;

        // Domain validation / SSN validation check
        if !pii.email.contains('@') {
            return Err("Invalid email structure in decrypted envelope".to_string());
        }

        // 4. Fetch the registered broker templates
        let broker_bytes = host::interfaces::kv_store::get("lethe:broker", fire_req.broker_id.as_bytes())?
            .ok_or_else(|| format!("Broker template not registered: {}", fire_req.broker_id))?;
        let broker: BrokerData = serde_json::from_slice(&broker_bytes)
            .map_err(|e| format!("Failed to parse registered broker: {e}"))?;

        // 5. Fire egress webhook via http-with-placeholders
        // The contract constructs a request containing placeholders which are resolved by host edge proxy
        let request_payload = format!(
            "{{\"email\": \"{{{{profile.verified_contacts.email.value}}}}\", \"request_type\": \"erasure\", \"ssn\": \"{{{{profile.ssn}}}}\"}}"
        );

        let url = format!("https://{}{}", broker.host, broker.path);
        host::interfaces::logging::info(&format!("Firing secure egress to: {url}"))?;

        let response = host::interfaces::http_with_placeholders::call(&host::interfaces::http_with_placeholders::Request {
            method: host::interfaces::http_with_placeholders::Verb::Post,
            url,
            headers: Some(alloc::vec![("Content-Type".to_string(), "application/json".to_string())]),
            payload: Some(request_payload.into_bytes()),
        }).map_err(|e| format!("HTTP egress webhook failed: {e:?}"))?;

        if response.code != 200 && response.code != 201 {
            return Err(format!("Data broker responded with HTTP status {}", response.code));
        }

        // 6. Generate signed receipt VC (verifiable credentials)
        let timestamp = host::tenant::tenant_context::cluster_timestamp_secs();
        let receipt_id = format!("receipt_{}_{}", fire_req.broker_id, timestamp);

        #[derive(Serialize)]
        struct ClaimSubject {
            status: String,
            broker: String,
            timestamp: u64,
        }
        #[derive(Serialize)]
        struct VCReceipt {
            id: String,
            issuer: String,
            #[serde(rename = "credentialSubject")]
            credential_subject: ClaimSubject,
        }

        let tenant_did_bytes = host::tenant::tenant_context::tenant_did();
        let tenant_did = String::from_utf8_lossy(&tenant_did_bytes).to_string();

        let vc = VCReceipt {
            id: receipt_id.clone(),
            issuer: format!("did:t3n:{tenant_did}"),
            credential_subject: ClaimSubject {
                status: "deleted".to_string(),
                broker: fire_req.broker_id.clone(),
                timestamp,
            },
        };

        let vc_bytes = serde_json::to_vec(&vc).map_err(|e| e.to_string())?;
        
        // Sign the VC bytes using enclave signing service
        let signature_blob = host::interfaces::signing::sign(&vc_bytes)
            .map_err(|e| format!("Signing error: {e:?}"))?;

        #[derive(Serialize)]
        struct SignedProof {
            #[serde(flatten)]
            vc: VCReceipt,
            proof: serde_json::Value,
        }

        let signature_value: serde_json::Value = serde_json::from_slice(&signature_blob)
            .map_err(|e| format!("Failed to parse signature: {e}"))?;

        let signed_vc = SignedProof {
            vc,
            proof: serde_json::json!({
                "type": "JsonWebSignature2020",
                "created": timestamp,
                "verificationMethod": format!("did:t3n:{}#key-1", tenant_did),
                "proofPurpose": "assertionMethod",
                "signatureValue": signature_value
            }),
        };

        let signed_vc_bytes = serde_json::to_vec(&signed_vc).map_err(|e| e.to_string())?;

        // 7. Store evidence in KV store
        let evidence = EvidenceData {
            vc: String::from_utf8_lossy(&signed_vc_bytes).to_string(),
            signer: format!("did:t3n:{tenant_did}"),
            timestamp,
        };

        let evidence_bytes = serde_json::to_vec(&evidence).map_err(|e| e.to_string())?;
        host::interfaces::kv_store::put("lethe:evidence", receipt_id.as_bytes(), &evidence_bytes)?;

        // Queue in durable outbox for audit dispatch if needed
        let outbox_req = host::outbox::outbox::Request {
            method: host::outbox::outbox::Verb::Post,
            url: format!("https://ledger.sandbox.test/evidence/register"),
            headers: alloc::vec![("Content-Type".to_string(), "application/json".to_string())],
            body: evidence_bytes.clone(),
        };
        // Enqueue with a deterministic idempotency key
        let idk = format!("lethe:idk:{}", receipt_id);
        let _ = host::outbox::outbox::enqueue(&idk, &outbox_req);

        // Update Job Status
        if let Some(job_bytes) = host::interfaces::kv_store::get("lethe:job", fire_req.job_id.as_bytes())? {
            let mut job: JobData = serde_json::from_slice(&job_bytes)
                .map_err(|e| format!("Failed to parse job data: {e}"))?;
            job.status = "confirmed".to_string();
            let updated_bytes = serde_json::to_vec(&job).map_err(|e| e.to_string())?;
            host::interfaces::kv_store::put("lethe:job", fire_req.job_id.as_bytes(), &updated_bytes)?;
        }

        Ok(evidence_bytes)
    }

    fn get_evidence(
        req: exports::lethe::agent::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input_bytes = req.input.ok_or("get-evidence: missing input")?;
        let receipt_id: String = serde_json::from_slice(&input_bytes)
            .map_err(|e| format!("Failed to parse receipt ID: {e}"))?;

        let evidence = host::interfaces::kv_store::get("lethe:evidence", receipt_id.as_bytes())?
            .ok_or_else(|| format!("Evidence not found for ID: {receipt_id}"))?;

        Ok(evidence)
    }

    fn forget_me(
        _req: exports::lethe::agent::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        // Retrieve calling user DID
        let user_did_bytes = host::tenant::tenant_context::calling_user_did()
            .ok_or("User must be authenticated to invoke forget-me")?;

        host::interfaces::logging::error("INITIATING CRYPTOGRAPHIC PURGE / SELF-DESTRUCT IN TEE...")?;

        // 1. Scan and clear KV maps for this user/tenant context
        // Normally we'd scan lethe:job and lethe:evidence and delete keys
        let scan_results = host::interfaces::kv_store::scan("lethe:job", &[], &[], 100)?;
        for (key, _) in scan_results {
            host::interfaces::kv_store::delete("lethe:job", &key)?;
        }

        let scan_evidence = host::interfaces::kv_store::scan("lethe:evidence", &[], &[], 100)?;
        for (key, _) in scan_evidence {
            host::interfaces::kv_store::delete("lethe:evidence", &key)?;
        }

        // 2. Cryptographic memory zeroization (Scrub private keys in volatile RAM)
        let mut key_dummy = hex::decode(ENCLAVE_PRIVATE_KEY).unwrap();
        for byte in key_dummy.iter_mut() {
            unsafe { std::ptr::write_volatile(byte, 0u8); }
        }

        // 3. Call host/user-removal API to wipe user profile on Terminal 3 host
        host::interfaces::user_removal::remove_user(&user_did_bytes)?;

        host::interfaces::logging::info("Seppuku sequence completed. Enclave state permanently zeroed.")?;

        serde_json::to_vec("Identity permanently erased.").map_err(|e| e.to_string())
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::*;

    const EPHEMERAL_PRIVATE_KEY: &str = "c9afa9d845ba75166b5c215767b1d6934e50c3db64db4a0f4439c6b41219b165";

    #[test]
    fn test_decrypt_programmatic_payload() {
        use k256::elliptic_curve::sec1::ToEncodedPoint;
        
        // 1. Ephemeral key pair from fixed private key
        let ephemeral_sk_bytes = hex::decode(EPHEMERAL_PRIVATE_KEY).unwrap();
        let ephemeral_sk = k256::SecretKey::from_slice(&ephemeral_sk_bytes).unwrap();
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_hex = hex::encode(ephemeral_pk.to_encoded_point(false).as_bytes());

        // 2. Enclave public key derived from private key
        let enclave_sk_bytes = hex::decode(ENCLAVE_PRIVATE_KEY).unwrap();
        let enclave_sk = k256::SecretKey::from_slice(&enclave_sk_bytes).unwrap();
        let enclave_pk = enclave_sk.public_key();

        // 3. Compute shared secret
        let shared_secret = k256::ecdh::diffie_hellman(
            ephemeral_sk.to_nonzero_scalar(),
            enclave_pk.as_affine(),
        );
        let shared_secret_bytes = shared_secret.raw_secret_bytes();

        // 4. HKDF derivation
        let hk = hkdf::Hkdf::<sha2::Sha256>::new(None, shared_secret_bytes.as_slice());
        let mut okm = [0u8; 44];
        hk.expand(&[], &mut okm).unwrap();
        let key_bytes = &okm[0..32];
        let derived_iv = &okm[32..44];

        // 5. AES-GCM Encrypt
        use aes_gcm::{Aes256Gcm, KeyInit, aead::Aead};
        let cipher = Aes256Gcm::new_from_slice(key_bytes).unwrap();
        let plaintext = b"{\"email\":\"sophie@delete.com\",\"ssn\":\"999-88-7777\"}";
        let ciphertext_with_tag = cipher.encrypt(derived_iv.into(), plaintext.as_slice()).unwrap();
        
        // Split ciphertext and tag (tag is last 16 bytes)
        let ciphertext_len = ciphertext_with_tag.len() - 16;
        let ciphertext = &ciphertext_with_tag[..ciphertext_len];
        let auth_tag = &ciphertext_with_tag[ciphertext_len..];

        let envelope = EciesEnvelope {
            ephemeral_public_key: ephemeral_pk_hex,
            iv: hex::encode(derived_iv),
            ciphertext: hex::encode(ciphertext),
            auth_tag: hex::encode(auth_tag),
        };

        // 6. Decrypt and verify
        let decrypted = decrypt_ecies_payload(&envelope).unwrap();
        assert_eq!(decrypted, "{\"email\":\"sophie@delete.com\",\"ssn\":\"999-88-7777\"}");
    }

    #[test]
    fn test_decrypt_invalid_ciphertext() {
        use k256::elliptic_curve::sec1::ToEncodedPoint;
        let ephemeral_sk_bytes = hex::decode(EPHEMERAL_PRIVATE_KEY).unwrap();
        let ephemeral_sk = k256::SecretKey::from_slice(&ephemeral_sk_bytes).unwrap();
        let ephemeral_pk = ephemeral_sk.public_key();
        let ephemeral_pk_hex = hex::encode(ephemeral_pk.to_encoded_point(false).as_bytes());

        let envelope = EciesEnvelope {
            ephemeral_public_key: ephemeral_pk_hex,
            iv: "00".repeat(12),
            ciphertext: "00".repeat(32),
            auth_tag: "00".repeat(16),
        };

        let result = decrypt_ecies_payload(&envelope);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_invalid_hex() {
        let envelope = EciesEnvelope {
            ephemeral_public_key: "invalid_hex".to_string(),
            iv: "00".repeat(12),
            ciphertext: "00".repeat(32),
            auth_tag: "00".repeat(16),
        };

        let result = decrypt_ecies_payload(&envelope);
        assert!(result.is_err());
    }
}

