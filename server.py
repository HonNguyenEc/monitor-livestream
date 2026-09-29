#!/usr/bin/env python3
"""Local dashboard for the livestream capture feasibility PoC."""
from __future__ import annotations

import json
import mimetypes
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from qc_probe import capture, resolve_shopee, resolve_tiktok, safe_error

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'shops.json'
RESULTS = ROOT / 'results'
WEB = ROOT / 'web'
STREAMS = ROOT / 'streams'
PORT = 8765
TIMEOUT = 25
lock = threading.RLock()
latest = {}
stream_procs: dict[str, subprocess.Popen] = {}
stream_meta: dict[str, dict] = {}
mpv_jobs: dict[str, dict] = {}
mpv_lock = threading.RLock()
refreshing = False


def load_shops():
    return json.loads(CONFIG.read_text(encoding='utf-8-sig')).get('shops', [])


def key_for(shop: dict) -> str:
    label = re.sub(r'[^a-zA-Z0-9_-]', '_', shop.get('username') or shop.get('name') or str(shop.get('shop_id')))
    return f"{shop['platform'].lower()}_{label}"


def label_for(shop: dict) -> str:
    return shop.get('username') or shop.get('name') or str(shop.get('shop_id'))


def console_log(event: str, key: str, message: str = ''):
    stamp = datetime.now().astimezone().isoformat(timespec='seconds')
    suffix = f' | {message}' if message else ''
    print(f'[{stamp}] [{key}] {event}{suffix}', flush=True)


def load_latest_report():
    reports = sorted(RESULTS.glob('*/report.json'), key=lambda p: p.stat().st_mtime, reverse=True)
    if not reports:
        return
    try:
        report = json.loads(reports[0].read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return
    base = reports[0].parent
    with lock:
        for row in report.get('results', []):
            row['_report_dir'] = str(base)
            latest[f"{row.get('platform')}:{row.get('shop')}"] = row


def run_probe():
    global refreshing
    with lock:
        if refreshing:
            return
        refreshing = True

    def work():
        global refreshing
        try:
            cfg = json.loads(CONFIG.read_text(encoding='utf-8-sig'))
            out = RESULTS / datetime.now().strftime('%Y%m%d_%H%M%S')
            out.mkdir(parents=True, exist_ok=True)
            rows = []
            for shop in cfg.get('shops', []):
                platform, label = shop['platform'].lower(), label_for(shop)
                row = {'platform': platform, 'shop': label, 'checked_at': datetime.now(timezone.utc).isoformat(), 'status': 'probe_inconclusive'}
                try:
                    urls, detail = resolve_tiktok(shop, TIMEOUT) if platform == 'tiktok' else resolve_shopee(shop, TIMEOUT)
                    if urls:
                        dest = out / key_for(shop)
                        result = capture(urls[0], dest, int(cfg.get('capture_seconds', 10)), int(cfg.get('frame_interval_seconds', 2)), TIMEOUT)
                        row.update({'capture': result, 'status': 'captured' if result['ok'] else 'capture_failed', 'stream_host': urlparse(urls[0]).hostname})
                        with lock:
                            stream_meta[key_for(shop)] = {'platform': platform, 'shop': shop, 'checked_at': row['checked_at']}
                    else:
                        row['error'] = detail
                except Exception as exc:
                    row['error'] = str(exc)[:1000]
                rows.append(row)
            report = {'started_at': datetime.now(timezone.utc).isoformat(), 'results': rows}
            (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            load_latest_report()
        finally:
            with lock:
                refreshing = False
    threading.Thread(target=work, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    server_version = 'LivestreamQCDemo/0.1'

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args))

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == '/api/shops':
            load_latest_report()
            shops = []
            with lock:
                is_refreshing = refreshing
                rows = dict(latest)
            for shop in load_shops():
                platform, label, key = shop['platform'].lower(), label_for(shop), key_for(shop)
                row = dict(rows.get(f'{platform}:{label}', {}))
                capture_path = None
                report_dir = row.get('_report_dir')
                if report_dir:
                    frames = sorted((Path(report_dir) / key).glob('frame_*.jpg'))
                    if frames:
                        capture_path = f'/api/frame/{frames[-1].parent.parent.name}/{key}/{frames[-1].name}'
                with mpv_lock:
                    mpv_job = mpv_jobs.get(key, {})
                    mpv_state = mpv_job.get('state', 'stopped')
                    mpv_message = mpv_job.get('message')
                    mpv_attempts = mpv_job.get('attempts', 0)
                    if mpv_state == 'playing' and (not mpv_job.get('proc') or mpv_job['proc'].poll() is not None):
                        mpv_job.update(state='stopped', message='Cửa sổ mpv đã đóng.')
                        mpv_state, mpv_message = mpv_job['state'], mpv_job['message']
                shops.append({'key': key, 'platform': platform, 'label': label, 'status': row.get('status', 'not_checked'),
                              'checked_at': row.get('checked_at'), 'error': row.get('error'), 'frame': capture_path,
                              'stream_available': bool(stream_meta.get(key)), 'streaming': bool(stream_procs.get(key) and stream_procs[key].poll() is None),
                              'mpv_state': mpv_state, 'mpv_attempts': mpv_attempts, 'mpv_message': mpv_message})
            return self.send_json({'shops': shops, 'refreshing': is_refreshing})
        if path.startswith('/api/frame/'):
            parts = path.strip('/').split('/')
            if len(parts) == 5:
                target = (RESULTS / parts[2] / parts[3] / parts[4]).resolve()
                if RESULTS.resolve() in target.parents and target.is_file() and target.suffix.lower() in {'.jpg', '.jpeg'}:
                    return self.send_file(target)
            return self.send_json({'error': 'frame_not_found'}, 404)
        if path.startswith('/streams/'):
            parts = path.strip('/').split('/')
            if len(parts) == 3:
                target = (STREAMS / parts[1] / parts[2]).resolve()
                if STREAMS.resolve() in target.parents and target.is_file() and target.suffix.lower() in {'.m3u8', '.ts'}:
                    return self.send_file(target)
            return self.send_json({'error': 'stream_segment_not_found'}, 404)
        if path == '/' or path == '/index.html':
            return self.send_file(WEB / 'index.html')
        return self.send_json({'error': 'not_found'}, 404)

    def send_file(self, path: Path):
        data = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if path.suffix == '.m3u8':
            content_type = 'application/vnd.apple.mpegurl'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        if path == '/api/refresh':
            run_probe()
            return self.send_json({'started': True})
        match = re.fullmatch(r'/api/approach/(browser|direct_stream|desktop_player)/([a-zA-Z0-9_-]+)', path)
        if match:
            method, key = match.groups()
            try:
                result = subprocess.run([sys.executable, str(ROOT / 'approach_runner.py'), method, key],
                                        capture_output=True, text=True, timeout=45, check=False)
                if result.stdout.strip():
                    payload = json.loads(result.stdout.strip().splitlines()[-1])
                    return self.send_json(payload, 200 if result.returncode == 0 else 500)
                return self.send_json({'error': result.stderr[-1000:] or 'approach_runner_failed'}, 500)
            except subprocess.TimeoutExpired:
                return self.send_json({'error': 'approach_probe_timeout'}, 504)
        match = re.fullmatch(r'/api/play/([a-zA-Z0-9_-]+)', path)
        if match:
            return self.start_stream(match.group(1))
        match = re.fullmatch(r'/api/mpv/start/([a-zA-Z0-9_-]+)', path)
        if match:
            return self.start_mpv_retry(match.group(1))
        match = re.fullmatch(r'/api/mpv/stop/([a-zA-Z0-9_-]+)', path)
        if match:
            return self.stop_mpv_retry(match.group(1))
        match = re.fullmatch(r'/api/stop/([a-zA-Z0-9_-]+)', path)
        if match:
            key = match.group(1)
            with lock:
                proc = stream_procs.pop(key, None)
            if proc and proc.poll() is None:
                proc.terminate()
            return self.send_json({'stopped': True})
        return self.send_json({'error': 'not_found'}, 404)

    def start_mpv_retry(self, key):
        shop = next((s for s in load_shops() if key_for(s) == key), None)
        if not shop:
            return self.send_json({'error': 'shop_not_found'}, 404)
        if shop.get('platform', '').lower() != 'tiktok':
            return self.send_json({'error': 'mpv_retry_currently_tiktok_only'}, 400)
        with mpv_lock:
            job = mpv_jobs.get(key)
            if job and job['state'] in {'retrying', 'checking_image', 'playing'}:
                return self.send_json({'started': False, 'state': job['state'], 'message': job.get('message')})
            event = threading.Event()
            mpv_jobs[key] = {'state': 'retrying', 'attempts': 0, 'message': 'Đang thử kết nối…', 'stop': event, 'proc': None}
        console_log('mpv_retry_started', key, label_for(shop))
        threading.Thread(target=self._mpv_retry_worker, args=(key, shop, event), daemon=True).start()
        return self.send_json({'started': True, 'state': 'retrying'})

    def stop_mpv_retry(self, key):
        with mpv_lock:
            job = mpv_jobs.get(key)
            if job:
                job['stop'].set()
                proc = job.get('proc')
                job['state'] = 'stopping'
                job['message'] = 'Đang dừng…'
            else:
                proc = None
        if proc and proc.poll() is None:
            proc.terminate()
        console_log('mpv_stop_requested', key)
        return self.send_json({'stopped': True})

    def _mpv_retry_worker(self, key, shop, stop_event):
        import shutil
        player = shutil.which('mpv') or shutil.which('mpvnet')
        fallback = Path.home() / 'AppData' / 'Local' / 'Programs' / 'mpv.net' / 'mpvnet.exe'
        if not player and fallback.is_file():
            player = str(fallback)
        if not player:
            with mpv_lock:
                mpv_jobs[key].update(state='error', message='Không tìm thấy mpv/mpv.net.')
            console_log('mpv_error', key, 'Không tìm thấy mpv/mpv.net')
            return
        shop_config = ROOT / 'mpv_configs' / key
        shop_config.mkdir(parents=True, exist_ok=True)
        instance_args = ['--config-dir=' + str(shop_config)]
        if Path(player).name.lower() == 'mpvnet.exe':
            # mpv.net defaults to one process and forwards new URLs to its existing window.
            instance_args.append('--process-instance=multi')
        if Path(player).name.lower() == 'mpv.exe':
            instance_args.append('--no-terminal')
        while not stop_event.is_set():
            with mpv_lock:
                job = mpv_jobs.get(key)
                if not job or job['stop'] is not stop_event:
                    return
                job['attempts'] += 1
                attempt = job['attempts']
                job.update(state='retrying', message=f'Lần thử {attempt}: đang lấy stream…')
            console_log('resolve_start', key, f'lần={attempt}')
            try:
                urls, detail = resolve_tiktok(shop, TIMEOUT)
            except Exception as exc:
                urls, detail = None, str(exc)[:300]
            if stop_event.is_set():
                break
            if not urls:
                console_log('resolve_failed', key, safe_error(detail))
                with mpv_lock:
                    if key in mpv_jobs: mpv_jobs[key]['message'] = f'Lần {attempt}: {detail[:220]}'
                stop_event.wait(5)
                continue
            console_log('resolve_ok', key, f'lần={attempt} host={urlparse(urls[0]).hostname or "unknown"}')
            command = [player, *instance_args, '--force-window=yes', '--keep-open=no', '--title=Livestream ' + label_for(shop), urls[0]]
            try:
                proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            except OSError as exc:
                with mpv_lock:
                    mpv_jobs[key].update(state='error', message=f'Không chạy được mpv: {exc}')
                console_log('mpv_launch_failed', key, str(exc))
                return
            console_log('mpv_launched', key, f'pid={proc.pid}')
            with mpv_lock:
                if key not in mpv_jobs: proc.terminate(); return
                mpv_jobs[key].update(state='checking_image', proc=proc, message=f'Lần {attempt}: mpv mở luồng, đang kiểm tra hình…')
            image_found = False
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline and not stop_event.is_set() and proc.poll() is None:
                time.sleep(1)
                try:
                    probe_path = ROOT / 'mpv_checks' / key / 'latest.jpg'
                    probe_path.parent.mkdir(parents=True, exist_ok=True)
                    probe = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-rw_timeout', '5000000',
                                            '-i', urls[0], '-frames:v', '1', str(probe_path)], capture_output=True, timeout=7, check=False)
                    if probe.returncode == 0 and probe_path.is_file() and probe_path.stat().st_size > 0:
                        image_found = True
                        console_log('image_detected', key, f'frame_bytes={probe_path.stat().st_size}')
                        break
                except (subprocess.TimeoutExpired, OSError):
                    pass
            if image_found:
                with mpv_lock:
                    if key in mpv_jobs: mpv_jobs[key].update(state='playing', message='Đã nhận được hình ảnh trong luồng mpv.', proc=proc)
                while not stop_event.wait(1) and proc.poll() is None:
                    pass
                if proc.poll() is None: proc.terminate()
                break
            if proc.poll() is None: proc.terminate()
            console_log('image_not_detected', key, f'lần={attempt}; mpv_exit={proc.poll()}')
            try: proc.wait(timeout=3)
            except subprocess.TimeoutExpired: proc.kill()
            if not stop_event.is_set(): stop_event.wait(3)
        with mpv_lock:
            job = mpv_jobs.get(key)
            if job and job['stop'] is stop_event:
                job.update(state='stopped', message='Đã dừng dò/kết nối mpv.', proc=None)
        console_log('mpv_retry_stopped', key)

    def start_stream(self, key):
        shop = next((s for s in load_shops() if key_for(s) == key), None)
        if not shop:
            return self.send_json({'error': 'shop_not_found'}, 404)
        platform = shop['platform'].lower()
        try:
            urls, detail = resolve_tiktok(shop, TIMEOUT) if platform == 'tiktok' else resolve_shopee(shop, TIMEOUT)
        except Exception as exc:
            return self.send_json({'error': str(exc)[:1000]}, 502)
        if not urls:
            return self.send_json({'error': detail, 'status': 'probe_inconclusive'}, 409)
        folder = STREAMS / key
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob('*'):
            if old.is_file():
                old.unlink()
        playlist = folder / 'index.m3u8'
        cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-rw_timeout', str(TIMEOUT * 1_000_000),
               '-i', urls[0], '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
               '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
               '-hls_flags', 'delete_segments+append_list+independent_segments', str(playlist)]
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except OSError as exc:
            return self.send_json({'error': f'ffmpeg_start_failed: {exc}'}, 500)
        with lock:
            previous = stream_procs.get(key)
            stream_procs[key] = proc
            stream_meta[key] = {'platform': platform, 'shop': shop, 'checked_at': datetime.now(timezone.utc).isoformat()}
        if previous and previous.poll() is None:
            previous.terminate()
        time.sleep(1.5)
        if proc.poll() is not None:
            return self.send_json({'error': 'ffmpeg_exited_early; check stream access and codec support'}, 502)
        return self.send_json({'url': f'/streams/{key}/index.m3u8'})


if __name__ == '__main__':
    load_latest_report()
    STREAMS.mkdir(exist_ok=True)
    print(f'Livestream QC demo: http://127.0.0.1:{PORT}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
