"""One parent window (the cluster) that holds every monitored shop's mpv as a tile of a grid.

mpv is embedded with --wid into a cell of a Tk window, so resizing or moving the parent window
scales and moves all players with it. Shops that are live are tiled first. The parent window's
position/size and the grid's rows/columns are user settings, edited from the dashboard.
"""
from __future__ import annotations

import json
import math
import queue
import re
import sys
import threading
from pathlib import Path

from .config import ROOT

LAYOUT_PATH = ROOT / 'mpv_layout.json'
# width/height 0: the parent window is maximized. rows/columns 0: chosen from the shop count.
DEFAULTS = {'enabled': True, 'x': 0, 'y': 0, 'width': 0, 'height': 0, 'rows': 0, 'columns': 0, 'gap': 4,
            'aspect': '9:16', 'live_only': False, 'ontop': False, 'detector': 'mpv', 'show_mpv': True}
# How a shop is found live. mpv: an mpv per shop plays the stream and its shown frames are counted
# (its window can be hidden when the browser wall is used to watch). ffmpeg: no player stays
# connected; FFmpeg grabs one frame per check, and the browser wall is the only place to watch.
DETECTORS = ('mpv', 'ffmpeg')
ASPECTS = {'9:16': 9 / 16, '16:9': 16 / 9, '3:4': 3 / 4, '1:1': 1.0}
CAPTION_HEIGHT = 22  # px of the shop-name bar above each player
WINDOW_TITLE = 'Livestream QC - mpv'

if sys.platform == 'win32':
    import ctypes
    from ctypes import wintypes

    try:  # physical pixels, so the dashboard's numbers match the screen on a scaled display
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except (AttributeError, OSError):
        pass


def screen_area() -> dict:
    """Primary screen work area (the screen minus the taskbar) in physical pixels."""
    if sys.platform == 'win32':
        rect = wintypes.RECT()
        if ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):  # SPI_GETWORKAREA
            return {'x': rect.left, 'y': rect.top, 'width': rect.right - rect.left, 'height': rect.bottom - rect.top}
    return {'x': 0, 'y': 0, 'width': 1920, 'height': 1080}


def dimensions(count: int, settings: dict, width: float, height: float) -> tuple[int, int]:
    """(rows, columns) of the grid. A fixed side is kept; a side left at 0 grows to fit `count`;
    with both at 0, the column count that shows the biggest video of the configured aspect."""
    rows, cols, gap = settings['rows'], settings['columns'], settings['gap']
    count = max(count, 1)
    if rows and cols:
        return rows, cols
    if cols:
        return math.ceil(count / cols), cols
    if rows:
        return rows, math.ceil(count / rows)

    def video(c: int) -> float:
        r = math.ceil(count / c)
        cell_w, cell_h = (width - gap * c) / c, (height - gap * r) / r - CAPTION_HEIGHT
        return min(cell_w, cell_h * ASPECTS[settings['aspect']])

    cols = max(range(1, count + 1), key=video)
    return math.ceil(count / cols), cols


class MpvLayout:
    def __init__(self):
        self._lock = threading.Lock()
        self._order: list[str] = []  # shop keys holding a tile, in the order they joined
        self._labels: dict[str, str] = {}
        self._live: set[str] = set()
        self._size = (0, 0)  # parent window client size, reported by the window
        self.settings = self._load()
        self._window: ContainerWindow | None = None

    # ---- settings ------------------------------------------------------------

    @staticmethod
    def _load() -> dict:
        try:
            saved = json.loads(LAYOUT_PATH.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            saved = {}
        return clean_settings({**DEFAULTS, **(saved if isinstance(saved, dict) else {})})

    def _save(self, settings: dict) -> None:
        LAYOUT_PATH.write_text(json.dumps(settings, indent=2), encoding='utf-8')
        with self._lock:
            self.settings = settings

    def update(self, data: dict) -> dict:
        """Save settings from the dashboard and move the parent window to the new position/size."""
        self._save(clean_settings({**self.settings, **data}))
        self._redraw(geometry=True)
        return self.settings

    def remember_geometry(self, x: int, y: int, width: int, height: int) -> None:
        """The user moved or resized the parent window: keep that as the cluster's place."""
        new = {'x': x, 'y': y, 'width': width, 'height': height}
        if any(self.settings[k] != v for k, v in new.items()):
            self._save(clean_settings({**self.settings, **new}))

    # ---- tiles ---------------------------------------------------------------

    def join(self, key: str, label: str) -> None:
        with self._lock:
            self._labels[key] = label
            if key not in self._order:
                self._order.append(key)
        self._redraw()

    def leave(self, key: str) -> None:
        with self._lock:
            if key in self._order:
                self._order.remove(key)
            self._live.discard(key)
        self._redraw()

    def set_live(self, key: str, live: bool) -> None:
        with self._lock:
            if (key in self._live) == live:
                return
            (self._live.add if live else self._live.discard)(key)
        self._redraw()

    def view(self) -> dict:
        """What the parent window shows: grid size and the tiles in display order, live shops first."""
        with self._lock:
            settings, live, size, order = self.settings, set(self._live), self._size, list(self._order)
            labels = dict(self._labels)
        keys = sorted(order, key=lambda k: k not in live)  # stable: join order within each group
        if settings['live_only']:
            keys = [k for k in keys if k in live]
        width, height = size if all(size) else (self.area()['width'], self.area()['height'])
        rows, cols = dimensions(len(keys), settings, width, height)
        tiles = [{'key': k, 'label': labels.get(k, k), 'live': k in live, 'visible': i < rows * cols}
                 for i, k in enumerate(keys)]
        hidden = [{'key': k, 'label': labels.get(k, k), 'live': False, 'visible': False}
                  for k in order if k not in keys]
        return {'rows': rows, 'columns': cols, 'tiles': tiles + hidden}

    def area(self) -> dict:
        s = self.settings
        return {k: s[k] for k in ('x', 'y', 'width', 'height')} if s['width'] and s['height'] else screen_area()

    def snapshot(self) -> dict:
        return {'settings': self.settings, 'screen': screen_area(), 'area': self.area(), 'aspects': list(ASPECTS),
                'detectors': list(DETECTORS),
                'embedded': self._window is not None and self._window.ok, **self.view()}

    # ---- the parent window -----------------------------------------------------

    def mpv_args(self, key: str, player: str) -> list[str]:
        """Options that open this shop's mpv inside its tile; [] leaves it a free-floating window.
        A hidden mpv is still embedded, in the hidden parent window: with no video output at all
        (--vo=null) mpv would stop counting frames, which is how a live is detected."""
        hidden = not self.settings['show_mpv']
        mute = ['--mute=yes'] if hidden else []
        if not (self.settings['enabled'] or hidden) or Path(player).name.lower() != 'mpv.exe':
            return mute  # mpv.net cannot be embedded
        with self._lock:
            if self._window is None or not self._window.ok:
                self._window = ContainerWindow(self)
        wid = self._window.video_wid(key)
        return [f'--wid={wid}', *mute] if wid else mute

    def _redraw(self, geometry: bool = False) -> None:
        if self._window is not None:
            self._window.redraw(geometry)

    def _report_size(self, width: int, height: int) -> None:
        with self._lock:
            self._size = (width, height)


class ContainerWindow:
    """The Tk parent window, run on its own thread; other threads talk to it through a queue."""

    def __init__(self, layout: MpvLayout):
        self.layout = layout
        self.ok = True
        self._tasks: queue.Queue = queue.Queue()
        self._ready = threading.Event()
        threading.Thread(target=self._run, daemon=True, name='mpv-container').start()
        self._ready.wait(10)

    # ---- called from any thread ------------------------------------------------

    def redraw(self, geometry: bool = False) -> None:
        self._tasks.put(lambda: self._draw(geometry))

    def video_wid(self, key: str) -> int | None:
        """Window handle mpv should draw into for `key` (its tile is created on first use)."""
        result: dict = {}
        done = threading.Event()

        def make():
            result['wid'] = self._tile(key)['video'].winfo_id()
            self._draw()
            done.set()

        self._tasks.put(make)
        return result.get('wid') if done.wait(5) else None

    # ---- Tk thread ---------------------------------------------------------------

    def _run(self) -> None:
        try:
            import tkinter as tk
        except ImportError:
            self.ok = False
            self._ready.set()
            return
        self.tk = tk
        self.root = tk.Tk()
        self.root.title(WINDOW_TITLE)
        self.root.configure(bg='#0b111c')
        self.root.protocol('WM_DELETE_WINDOW', self.root.iconify)  # monitoring keeps running; just minimize
        self.root.bind('<Configure>', self._on_configure)
        self.tiles: dict[str, dict] = {}
        self._shown = True
        self._save_after = None
        self._apply_geometry()
        self._ready.set()
        self.root.after(100, self._pump)
        try:
            self.root.mainloop()
        finally:
            self.ok = False

    def _pump(self) -> None:
        while True:
            try:
                task = self._tasks.get_nowait()
            except queue.Empty:
                break
            try:
                task()
            except self.tk.TclError:
                pass
        self.root.after(100, self._pump)

    def _apply_geometry(self) -> None:
        s = self.layout.settings
        self.root.attributes('-topmost', s['ontop'])
        if s['width'] and s['height']:
            self.root.state('normal')
            self.root.geometry(f"{s['width']}x{s['height']}+{s['x']}+{s['y']}")
        else:
            self.root.state('zoomed')

    def _on_configure(self, event) -> None:
        if event.widget is not self.root:
            return
        self.layout._report_size(event.width, event.height)
        if self._save_after:
            self.root.after_cancel(self._save_after)
        self._save_after = self.root.after(800, self._settled)

    def _settled(self) -> None:
        """After a move/resize: remember the new place (unless maximized) and re-pick an auto grid."""
        self._save_after = None
        if self.root.state() == 'normal':
            match = re.fullmatch(r'(\d+)x(\d+)([+-]-?\d+)([+-]-?\d+)', self.root.geometry())
            if match:
                w, h, x, y = (int(v) for v in match.groups())
                self.layout.remember_geometry(x, y, w, h)
        elif self.root.state() == 'zoomed':
            self.layout.remember_geometry(0, 0, 0, 0)
        self._draw()

    def _tile(self, key: str) -> dict:
        tile = self.tiles.get(key)
        if tile is None:
            tk = self.tk
            frame = tk.Frame(self.root, bg='#000')
            caption = tk.Label(frame, anchor='w', padx=8, fg='#cbd5e1', bg='#172031', font=('Segoe UI', 9))
            caption.place(x=0, y=0, relwidth=1, height=CAPTION_HEIGHT)
            video = tk.Frame(frame, bg='#000')
            video.place(x=0, y=CAPTION_HEIGHT, relwidth=1, relheight=1, height=-CAPTION_HEIGHT)
            tile = self.tiles[key] = {'frame': frame, 'caption': caption, 'video': video}
        return tile

    def _draw(self, geometry: bool = False) -> None:
        if geometry:
            self._apply_geometry()
        view = self.layout.view()
        rows, cols, gap = view['rows'], view['columns'], self.layout.settings['gap']
        tiles = [t for t in view['tiles'] if t['key'] in self.tiles or t['visible']]
        joined = {t['key'] for t in view['tiles']}
        for key in [k for k in self.tiles if k not in joined]:  # shop left: its mpv was stopped first
            self.tiles.pop(key)['frame'].destroy()
        for i, t in enumerate(tiles):
            tile = self._tile(t['key']) if t['visible'] else self.tiles[t['key']]
            if not t['visible']:
                tile['frame'].place_forget()
                continue
            r, c = divmod(i, cols)
            # Relative placement: Tk rescales every tile itself whenever the parent window is resized.
            tile['frame'].place(relx=c / cols, rely=r / rows, relwidth=1 / cols, relheight=1 / rows,
                                x=gap // 2, y=gap // 2, width=-gap, height=-gap)
            tile['caption'].configure(text=('●  LIVE   ' if t['live'] else '○  chờ live   ') + t['label'],
                                      fg='#45d19a' if t['live'] else '#8a93a4')
        s = self.layout.settings
        visible = s['detector'] == 'mpv' and s['show_mpv'] and any(t['visible'] for t in view['tiles'])
        if visible != self._shown:  # nothing to show, or watched on the browser wall: hide the window
            self._shown = visible
            if visible:
                self.root.deiconify()
                self._apply_geometry()
            else:
                self.root.withdraw()


def clean_settings(data: dict) -> dict:
    def number(name: str, low: int, high: int) -> int:
        try:
            return min(high, max(low, int(float(data.get(name, DEFAULTS[name])))))
        except (TypeError, ValueError):
            return DEFAULTS[name]

    width, height = number('width', 0, 20000), number('height', 0, 20000)
    if width < 200 or height < 150:  # missing or unusably small: maximize instead
        width = height = 0
    return {'enabled': bool(data.get('enabled', True)), 'x': number('x', -20000, 20000), 'y': number('y', -20000, 20000),
            'width': width, 'height': height, 'rows': number('rows', 0, 12), 'columns': number('columns', 0, 12),
            'gap': number('gap', 0, 100), 'aspect': data.get('aspect') if data.get('aspect') in ASPECTS else DEFAULTS['aspect'],
            'live_only': bool(data.get('live_only', False)), 'ontop': bool(data.get('ontop', False)),
            'detector': data.get('detector') if data.get('detector') in DETECTORS else DEFAULTS['detector'],
            'show_mpv': bool(data.get('show_mpv', True))}
