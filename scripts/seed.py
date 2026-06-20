import json
import urllib.request
import urllib.error

AGENT_URL = "http://localhost:8080/api"

def register_broker(broker):
    data = json.dumps(broker).encode('utf-8')
    req = urllib.request.Request(
        f"{AGENT_URL}/broker/register",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            return response.status, res_body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

def main():
    print("Initializing Lethe Sandbox Seeding Pipeline...")
    
    # 1. Load brokers
    try:
        with open("data/fixtures/brokers.json", "r") as f:
            brokers = json.load(f)
    except FileNotFoundError:
        print("Error: data/fixtures/brokers.json not found!")
        return

    # Register all 40 brokers
    success_count = 0
    for broker in brokers:
        status, res = register_broker(broker)
        if status == 200:
            success_count += 1
            print(f"✓ Registered broker: {broker['id']}")
        else:
            print(f"✗ Failed to register broker {broker['id']}: Status {status} - {res}")

    print(f"\nSuccessfully seeded {success_count} / {len(brokers)} data brokers in sandbox.")

    # 2. Print anomalous seed scenarios for documentation
    print("\n--- Anomalous Seed Test Scenarios Supported ---")
    print("1. Unicode/IDN Domain Email: sophie.mîller@brökers-r-us.xn--p1ai (Normalization verification)")
    print("2. SSN formatting: '999 88 7777' vs '999887777' (Regex parsing sanity)")
    print("3. Malicious JSON Injection: sophie@delete.com\\\", \\\"malicious_payload\\\": \\\"injected\\\" (Safety escaping)")
    print("4. Rate limit check: 429 Simulated retries for WhitePages-mock.")

if __name__ == "__main__":
    main()
