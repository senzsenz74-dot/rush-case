# Перенос анимации Mixamo (FBX) на скелет 3D-агента главной (assets/main/agent.glb) -> assets/main/breakdance.glb.
# Запуск (Blender 5.x, в фоне, GUI не трогает):
#   blender.exe -b --factory-startup --python tools/mixamo-retarget.py
# Пути можно задать: BD_FBX (файл Mixamo), BD_AG (agent.glb), BD_OUT (куда писать). BD_SIGMA — насколько гасить уход с места (с),
# BD_FACE=idle|front — начальный разворот. В выводе MAX direction error — расхождение направлений костей с оригиналом (градусы).
# Mixamo FBX -> CS2 agent skeleton (assets/main/agent.glb), only the animation, as a tiny GLB.
import bpy, json, struct, math, os
import numpy as np
from mathutils import Quaternion as Q, Vector as V, Matrix as M

FBX = os.environ.get("BD_FBX", os.path.join(os.path.expanduser("~"), "Downloads", "Breakdance Freeze Var 2.fbx"))
AG = os.environ.get("BD_AG", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "main", "agent.glb"))
OUT = os.environ.get("BD_OUT", os.path.join(os.path.dirname(AG), "breakdance.glb"))
SIGMA = float(os.environ.get('BD_SIGMA', '0.4'))
FACE = os.environ.get('BD_FACE', 'idle')  # idle: start facing like the idle pose; front: face the camera
YAWFIX = os.environ.get('BD_YAWFIX', '1') == '1'

def read_glb(p):
    b = open(p, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl].decode('utf-8')); o = 20 + jl; bl = struct.unpack_from('<I', b, o)[0]
    return j, b[o + 8:o + 8 + bl]
j, BIN = read_glb(AG)
NC = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; n = NC[a['type']]
    assert a['componentType'] == 5126 and not bv.get('byteStride')
    return np.frombuffer(BIN, np.float32, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, n)
N = j['nodes']; T = {n.get('name'): i for i, n in enumerate(N)}; par = {}
for i, n in enumerate(N):
    for c in n.get('children', []): par[c] = i
    if 'matrix' in n or (n.get('scale') and any(abs(x - 1) > 1e-4 for x in n['scale'])): print('WARN scale/matrix', n.get('name'), n.get('scale'))
def lq(i): r = N[i].get('rotation', [0, 0, 0, 1]); return Q((r[3], r[0], r[1], r[2]))
def lt(i): return V(N[i].get('translation', [0, 0, 0]))
order = []
def walk(i):
    order.append(i); [walk(c) for c in N[i].get('children', [])]
[walk(r) for r in j['scenes'][0]['nodes']]
QR, PR = {}, {}
for i in order:
    p = par.get(i)
    QR[i], PR[i] = (lq(i), lt(i)) if p is None else (QR[p] @ lq(i), PR[p] + QR[p] @ lt(i))

# ---- source (Mixamo) ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE'); act = arm.animation_data.action
f0, f1 = map(int, act.frame_range); frames = list(range(f0, f1 + 1)); FPS = sc.render.fps / sc.render.fps_base
SB = {b.name.split(':')[-1]: b for b in arm.data.bones}; SP = {p.name.split(':')[-1]: p for p in arm.pose.bones}
MW = arm.matrix_world.copy()
def cq(q): return Q((q.w, q.x, q.z, -q.y))
def cv(v): return V((v.x, v.z, -v.y))
def wrot(m): return cq((MW @ m).to_3x3().normalized().to_quaternion())
SQR = {n: wrot(b.matrix_local) for n, b in SB.items()}; SPR = {n: cv(MW @ b.head_local) for n, b in SB.items()}
SQ, SPp = [], []
for f in frames:
    sc.frame_set(f)
    SQ.append({n: wrot(p.matrix) for n, p in SP.items()}); SPp.append({n: cv(MW @ p.head) for n, p in SP.items()})

# ---- mapping ----
MAP = {'pelvis': 'Hips', 'spine_0': 'Spine', 'spine_2': 'Spine1', 'spine_3': 'Spine2', 'neck_0': 'Neck', 'head_0': 'Head'}
MIX = {'spine_1': ('Spine', 'Spine1', 0.5)}
LAT_T, LAT_S = ('leg_upper_L', 'leg_upper_R'), ('LeftUpLeg', 'RightUpLeg')
ALIGN = {'pelvis': ('two', None, None, LAT_T, LAT_S)}
CH = [('spine_0', 'spine_1', 'Spine', 'Spine1'), ('spine_1', 'spine_2', 'Spine', 'Spine1'), ('spine_2', 'spine_3', 'Spine1', 'Spine2'),
      ('spine_3', 'neck_0', 'Spine2', 'Neck'), ('neck_0', 'head_0', 'Neck', 'Head')]
CONTACT = [('head_0', 'Head', 0)]
for s, S in (('L', 'Left'), ('R', 'Right')):
    MAP.update({f'clavicle_{s}': f'{S}Shoulder', f'arm_upper_{s}': f'{S}Arm', f'arm_lower_{s}': f'{S}ForeArm', f'hand_{s}': f'{S}Hand',
                f'leg_upper_{s}': f'{S}UpLeg', f'leg_lower_{s}': f'{S}Leg', f'ankle_{s}': f'{S}Foot', f'ball_{s}': f'{S}ToeBase'})
    CH += [(f'clavicle_{s}', f'arm_upper_{s}', f'{S}Shoulder', f'{S}Arm'), (f'arm_upper_{s}', f'arm_lower_{s}', f'{S}Arm', f'{S}ForeArm'),
           (f'arm_lower_{s}', f'hand_{s}', f'{S}ForeArm', f'{S}Hand'), (f'leg_upper_{s}', f'leg_lower_{s}', f'{S}UpLeg', f'{S}Leg'),
           (f'leg_lower_{s}', f'ankle_{s}', f'{S}Leg', f'{S}Foot')]
    for fn, FN in (('thumb', 'Thumb'), ('index', 'Index'), ('middle', 'Middle'), ('ring', 'Ring'), ('pinky', 'Pinky')):
        for k in range(3): MAP[f'finger_{fn}_{k}_{s}'] = f'{S}Hand{FN}{k + 1}'
        for k in range(2): CH.append((f'finger_{fn}_{k}_{s}', f'finger_{fn}_{k + 1}_{s}', f'{S}Hand{FN}{k + 1}', f'{S}Hand{FN}{k + 2}'))
    ALIGN[f'hand_{s}'] = ('two', (f'hand_{s}', f'finger_middle_0_{s}'), (f'{S}Hand', f'{S}HandMiddle1'), (f'finger_index_0_{s}', f'finger_pinky_0_{s}'), (f'{S}HandIndex1', f'{S}HandPinky1'))
    ALIGN[f'ankle_{s}'] = ('two', (f'ankle_{s}', f'ball_{s}'), (f'{S}Foot', f'{S}ToeBase'), LAT_T, LAT_S)
    CONTACT += [(f'hand_{s}', f'{S}Hand', 0), (f'arm_lower_{s}', f'{S}ForeArm', 0), (f'leg_lower_{s}', f'{S}Leg', 0), (f'ankle_{s}', f'{S}Foot', 1), (f'ball_{s}', f'{S}ToeBase', 1)]
for a, b, c, d in CH: ALIGN[a] = ('dir', b, c, d)
missing = [v for v in MAP.values() if v not in SB] + [k for k in list(MAP) + list(MIX) if k not in T]
print('MISSING', missing)

# ---- target rest -> source T-pose ----
def frame(a, l):
    x = a.normalized(); z = x.cross(l).normalized(); y = z.cross(x)
    return M((x, y, z)).transposed()
QT, PT = {}, {}
for i in order:
    p = par.get(i); nm = N[i].get('name')
    if p is None: QT[i], PT[i] = QR[i].copy(), PR[i].copy(); continue
    q = QT[p] @ lq(i); P = PT[p] + QT[p] @ lt(i)
    def tp(n): k = T[n]; return PT[k] if k in PT else P + q @ (QR[i].inverted() @ (PR[k] - PR[i]))
    r = ALIGN.get(nm)
    if r and r[0] == 'dir':
        q = (tp(r[1]) - P).normalized().rotation_difference((SPR[r[3]] - SPR[r[2]]).normalized()) @ q
    elif r:
        _, ta, sa, tl, sl = r; up = V((0, 1, 0))
        at = up if ta is None else tp(ta[1]) - tp(ta[0]); as_ = up if sa is None else SPR[sa[1]] - SPR[sa[0]]
        R = frame(as_, SPR[sl[0]] - SPR[sl[1]]) @ frame(at, tp(tl[0]) - tp(tl[1])).transposed()
        q = R.to_quaternion() @ q
    QT[i], PT[i] = q, P

# ---- per frame ----
nF = len(frames)
ANIM = [nm for nm in [N[i].get('name') for i in order] if nm in MAP or nm in MIX]
def D(fi, s): return SQ[fi][s] @ SQR[s].inverted()
def lat_yaw(fi): d = SPp[fi]['LeftUpLeg'] - SPp[fi]['RightUpLeg']; return math.atan2(-d.z, d.x)
yaw0, yaw1 = lat_yaw(0), lat_yaw(nF - 1); dyaw = math.atan2(math.sin(yaw1 - yaw0), math.cos(yaw1 - yaw0))
print('YAW start %.1f end %.1f diff %.1f deg' % (math.degrees(yaw0), math.degrees(yaw1), math.degrees(dyaw)))
def smooth(t): t = min(1, max(0, t)); return t * t * (3 - 2 * t)
YF = [Q((0, 1, 0), -dyaw * smooth((fi / (nF - 1) - 0.55) / 0.45)) if YAWFIX else Q() for fi in range(nF)]  # facing back to start over the last ~45%

ip = T['pelvis']; k = PR[ip].y / SPR['Hips'].y
irm0 = T['root_motion']; _idle = next(a for a in j['animations'] if a['name'] == 'idle')
_ch = next(c for c in _idle['channels'] if c['target']['node'] == ip and c['target']['path'] == 'rotation')
_r = acc(_idle['samplers'][_ch['sampler']]['output'])[0]
QWi = QR[par[irm0]] @ lq(irm0) @ Q((float(_r[3]), float(_r[0]), float(_r[1]), float(_r[2])))
dl = QWi @ (QR[ip].inverted() @ (PR[T['leg_upper_L']] - PR[T['leg_upper_R']])); yaw_idle = math.atan2(-dl.z, dl.x)
turn = (yaw_idle if FACE == 'idle' else 0) - yaw0; G = Q((0, 1, 0), turn)
print('FACE idle %.1f deg, src start %.1f, turn %.1f' % (math.degrees(yaw_idle), math.degrees(yaw0), math.degrees(turn)))
YF = [G @ y for y in YF]
hp = np.array([[SPp[fi]['Hips'].x, SPp[fi]['Hips'].y, SPp[fi]['Hips'].z] for fi in range(nF)])
sg = max(1e-3, SIGMA * FPS); w = np.exp(-0.5 * (np.arange(-int(4 * sg), int(4 * sg) + 1) / sg) ** 2); w /= w.sum()
padn = len(w) // 2
def gfilt(x): xp = np.concatenate([np.full(padn, x[0]), x, np.full(padn, x[-1])]); return np.convolve(xp, w, 'valid')
res = hp.copy(); res[:, 0] -= gfilt(hp[:, 0]); res[:, 2] -= gfilt(hp[:, 2])
idle = next(a for a in j['animations'] if a['name'] == 'idle')
def first(node, path):
    for c in idle['channels']:
        if c['target']['node'] == T[node] and c['target']['path'] == path: return V(acc(idle['samplers'][c['sampler']]['output'])[0])
irm = T['root_motion']; Qrm = QR[par[irm]] @ lq(irm)
Pidle = PR[par[irm]] + QR[par[irm]] @ first('root_motion', 'translation') + Qrm @ first('pelvis', 'translation')
Prm = PR[irm]
cs_s = {s: SPR[s].y if c else 0 for _, s, c in CONTACT}; cs_t = {t: PR[T[t]].y if c else 0 for t, _, c in CONTACT}
LQ = {nm: [] for nm in ANIM}; PEL = []; dys = []; lows = []
for fi in range(nF):
    QW, PW = {}, {}
    for i in order:
        p = par.get(i); nm = N[i].get('name')
        if p is None: QW[i], PW[i] = QR[i], PR[i]; continue
        if nm in MAP: q = YF[fi] @ D(fi, MAP[nm]) @ QT[i]
        elif nm in MIX:
            a, b, t = MIX[nm]; da, db = D(fi, a), D(fi, b)
            if da.dot(db) < 0: db.negate()
            q = YF[fi] @ da.slerp(db, t) @ QT[i]
        else: q = QW[p] @ lq(i)
        if nm == 'pelvis':
            e = smooth((fi / (nF - 1) - 0.55) / 0.45)  # ends where it started: no slide back into idle
            r = V((res[fi, 0] - res[0, 0] - e * (res[-1, 0] - res[0, 0]), 0, res[fi, 2] - res[0, 2] - e * (res[-1, 2] - res[0, 2]))) * k
            PW[i] = V((Pidle.x, hp[fi, 1] * k, Pidle.z)) + YF[fi] @ r
        else: PW[i] = PW[p] + QW[p] @ lt(i)
        QW[i] = q
        if nm in LQ: LQ[nm].append(QW[p].inverted() @ q)
    smin = min(SPp[fi][s].y - cs_s[s] for _, s, _ in CONTACT); tmin = min(PW[T[t]].y - cs_t[t] for t, _, _ in CONTACT)
    dy = smin - tmin; dys.append(dy); P = PW[ip] + V((0, dy, 0)); PEL.append(Qrm.inverted() @ (P - Prm))
    lows.append(min(PW[T[t]].y + dy for t, _, _ in CONTACT))
print('k %.3f  fps %g frames %d  travel(src) x %.2f..%.2f z %.2f..%.2f  residual*k x %.2f..%.2f z %.2f..%.2f' % (k, FPS, nF, hp[:, 0].min(), hp[:, 0].max(), hp[:, 2].min(), hp[:, 2].max(),
      k * (res[:, 0] - res[0, 0]).min(), k * (res[:, 0] - res[0, 0]).max(), k * (res[:, 2] - res[0, 2]).min(), k * (res[:, 2] - res[0, 2]).max()))
print('floor dy %.3f..%.3f  lowest joint %.3f..%.3f  pelvis local t0 %s end %s' % (min(dys), max(dys), min(lows), max(lows), tuple(round(x, 3) for x in PEL[0]), tuple(round(x, 3) for x in PEL[-1])))
print('REST tgt legL', tuple(round(x, 3) for x in PR[T['leg_upper_L']]), 'handL', tuple(round(x, 2) for x in PR[T['hand_L']]), 'ankleL', tuple(round(x, 3) for x in PR[T['ankle_L']]),
      '| src LeftUpLeg', tuple(round(x, 3) for x in SPR['LeftUpLeg']), 'LeftHand', tuple(round(x, 2) for x in SPR['LeftHand']), 'hips', round(SPR['Hips'].y, 3))
print('idle pelvis', tuple(round(x, 3) for x in Pidle), 'rest pelvis', tuple(round(x, 3) for x in PR[ip]))
# check: world bone directions target vs source (yaw fix turns every bone the same way, so undo it)
err = 0
for fi in range(0, nF, 7):
    QW = {}
    for i in order:
        p = par.get(i); nm = N[i].get('name')
        QW[i] = QR[i] if p is None else QW[p] @ (LQ[nm][fi] if nm in LQ else lq(i))
    for a, b, c, d in CH:
        dt = (YF[fi].inverted() @ (QW[T[a]] @ (QR[T[a]].inverted() @ (PR[T[b]] - PR[T[a]])))).normalized()
        ds = (SPp[fi][d] - SPp[fi][c]).normalized(); err = max(err, math.degrees(dt.angle(ds)))
print('MAX direction error deg %.2f' % err)

# ---- write GLB: rotations as normalized int16 (glTF core), pelvis translation float ----
buf = bytearray(); accs = []; bvs = []
def add(arr, typ, ct=5126, norm=False, mm=False):
    data = arr.tobytes()
    while len(buf) % 4: buf.append(0)
    bvs.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(data)}); buf.extend(data)
    a = {'bufferView': len(bvs) - 1, 'componentType': ct, 'count': len(arr), 'type': typ}
    if norm: a['normalized'] = True
    if mm: a['min'] = [float(arr.min())]; a['max'] = [float(arr.max())]
    accs.append(a); return len(accs) - 1
ti = add(np.arange(nF, dtype=np.float32) / np.float32(FPS), 'SCALAR', mm=True)
nodes, samp, chans = [], [], []
def chan(nm, path, out):
    names = [n['name'] for n in nodes]
    if nm not in names: nodes.append({'name': nm}); names.append(nm)
    samp.append({'input': ti, 'output': out, 'interpolation': 'LINEAR'}); chans.append({'sampler': len(samp) - 1, 'target': {'node': names.index(nm), 'path': path}})
for nm in ANIM:
    a = np.array([[q.x, q.y, q.z, q.w] for q in LQ[nm]], dtype=np.float64)
    for r in range(1, nF):
        if np.dot(a[r], a[r - 1]) < 0: a[r] = -a[r]
    chan(nm, 'rotation', add(np.round(a * 32767).astype(np.int16), 'VEC4', 5122, True))
chan('pelvis', 'translation', add(np.array([[v.x, v.y, v.z] for v in PEL], dtype=np.float32), 'VEC3'))
gl = {'asset': {'version': '2.0', 'generator': 'RUSH CASE retarget (Mixamo Breakdance Freeze Var 2 -> agent)'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
      'nodes': nodes, 'animations': [{'name': 'breakdance', 'samplers': samp, 'channels': chans}], 'accessors': accs, 'bufferViews': bvs, 'buffers': [{'byteLength': len(buf)}]}
js = json.dumps(gl, separators=(',', ':')).encode('utf-8'); js += b' ' * (-len(js) % 4); buf += b'\0' * (-len(buf) % 4)
with open(OUT, 'wb') as fh:
    fh.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(buf))); fh.write(struct.pack('<I4s', len(js), b'JSON')); fh.write(js)
    fh.write(struct.pack('<I4s', len(buf), b'BIN\0')); fh.write(buf)
print('WROTE', OUT, os.path.getsize(OUT), 'bytes', len(chans), 'channels', '%.2fs' % ((nF - 1) / FPS))
