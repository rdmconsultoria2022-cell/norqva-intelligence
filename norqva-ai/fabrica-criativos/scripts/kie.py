#!/usr/bin/env python3
"""Helper KIE: createTask, poll, download. Auth via env KIE_API_KEY."""
import json, os, sys, time, urllib.request

API_KEY = os.environ.get("KIE_API_KEY", "")
if not API_KEY:
    sys.exit("KIE_API_KEY não definida. export KIE_API_KEY=\"...\" e abra um terminal novo.")
BASE = "https://api.kie.ai/api/v1/jobs"
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def create_task(model, inp):
    body = json.dumps({"model": model, "input": inp}).encode()
    req = urllib.request.Request(f"{BASE}/createTask", data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if data.get("code") != 200:
        raise RuntimeError(f"createTask failed: {data}")
    return data["data"]["taskId"]


def poll(task_id, interval=15, timeout=1800):
    start = time.time()
    while time.time() - start < timeout:
        req = urllib.request.Request(f"{BASE}/recordInfo?taskId={task_id}",
                                     headers={"Authorization": f"Bearer {API_KEY}"})
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())["data"]
        state = data.get("state")
        if state == "success":
            return json.loads(data["resultJson"])
        if state == "fail":
            raise RuntimeError(f"task {task_id} failed: {data.get('failMsg')}")
        time.sleep(interval)
    raise TimeoutError(f"task {task_id} timed out")


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r, open(path, "wb") as f:
        f.write(r.read())


def credit():
    req = urllib.request.Request("https://api.kie.ai/api/v1/chat/credit",
                                 headers={"Authorization": f"Bearer {API_KEY}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read()).get("data")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "credit":
        print(credit())
        sys.exit(0)
    # uso: kie.py '<model>' '<input-json>' [arquivo-saida]
    model, inp = sys.argv[1], json.loads(sys.argv[2])
    tid = create_task(model, inp)
    print(f"taskId={tid}", flush=True)
    result = poll(tid)
    print(json.dumps(result), flush=True)
    urls = result.get("resultUrls") or result.get("result_urls") or []
    if len(sys.argv) > 3 and urls:
        download(urls[0], sys.argv[3])
        print(f"saved={sys.argv[3]}", flush=True)
