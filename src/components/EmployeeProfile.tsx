import React, { useEffect, useMemo, useState } from 'react';
import { X, UserCircle2, Camera, Edit2, Save, ShieldCheck, Briefcase, Home, Users, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { EmployeeProfileView } from '../types';
import { authFetch } from '../authFetch';
import DateInput from './DateInput';
import { formatDateDDMMYYYY } from '../utils/dateFormat';

// Employee Profile (2026-09-24) - every login user's own profile, opened from
// the sidebar's user card. Personal details (photo, address, mobile, date of
// birth) are editable by the user themself; work details come from the HR
// Employee Master and account/access details from the login account, both
// read-only here. Super Admin / HR additionally get "Manage Profiles" for
// every login user. Every rule is enforced server-side (see /api/profile and
// /api/employee-profiles in server.ts) - this only mirrors it in the UI.

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_DIM = 512;

export const profilePhotoUrl = (path?: string): string | undefined => path ? `/${path}` : undefined;

const initialsOf = (name: string): string => name.substring(0, 2).toUpperCase();

// Validates a chosen photo, then downsizes it to at most 512px as a JPEG -
// a profile picture never needs a full camera-resolution file on disk.
async function prepareProfilePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPG or PNG image.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be 5MB or smaller.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image.'));
      i.src = url;
    });
    const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process the image.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('Could not process the image.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadProfilePhoto(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', new File([blob], 'profile.jpg', { type: 'image/jpeg' }));
  const res = await authFetch('/api/upload/profile-photos', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.path) throw new Error(data.message || 'Photo upload failed.');
  return data.path;
}

export function ProfileAvatar({ name, photo, className = 'w-9 h-9 rounded-xl text-xs' }: { name: string; photo?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photo]);
  if (photo && !broken) {
    return <img src={profilePhotoUrl(photo)} alt={name} onError={() => setBroken(true)} className={`${className} object-cover border border-pink-400/40 shrink-0 shadow-sm bg-white`} />;
  }
  return (
    <div className={`${className} bg-gradient-to-tr from-pink-500 to-purple-600 border border-pink-400/40 flex items-center justify-center text-white font-black shrink-0 shadow-sm`}>
      {initialsOf(name)}
    </div>
  );
}

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="min-w-0">
    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{label}</p>
    <p className={`text-xs font-semibold break-words ${value ? 'text-slate-800' : 'text-slate-300'}`}>{value || 'Not provided'}</p>
  </div>
);

const displayDate = (iso?: string) => iso ? formatDateDDMMYYYY(iso) || iso : undefined;
const ORG_UNIT_LABEL: Record<string, string> = { KCM_SUPPLY: 'KCM Supply', KCM_INSTA: 'KCM Insta' };

// The edit form - shared by "Edit Profile" (own profile, PUT /api/profile)
// and Manage Profiles (another user, PUT /api/employee-profiles/:username).
function ProfileEditForm({ view, endpoint, staffOptions, onSaved, onCancel }: {
  view: EmployeeProfileView;
  endpoint: string;
  staffOptions?: { id: string; name: string; email?: string }[];
  onSaved: (view: EmployeeProfileView) => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState(view.personal.address || '');
  const [mobile, setMobile] = useState(view.personal.mobile || '');
  const [dateOfBirth, setDateOfBirth] = useState(view.personal.dateOfBirth || '');
  const [staffLink, setStaffLink] = useState(view.employeeLink === 'manual' ? view.employee?.id || '' : '');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const blob = await prepareProfilePhoto(file);
      setPhotoBlob(blob);
      setPhotoPreview(URL.createObjectURL(blob));
      setRemovePhoto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use that photo.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mobile.trim() && !/^\d{10}$/.test(mobile.trim())) { setError('Mobile Number must be exactly 10 digits.'); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = { address: address.trim(), mobile: mobile.trim(), dateOfBirth };
      if (photoBlob) body.profilePhoto = await uploadProfilePhoto(photoBlob);
      else if (removePhoto) body.profilePhoto = '';
      if (staffOptions) body.staffEmployeeId = staffLink;
      const res = await authFetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save profile.');
      onSaved(data as EmployeeProfileView);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const shownPhoto = photoPreview || (removePhoto ? undefined : profilePhotoUrl(view.personal.profilePhoto));
  const hrNote = view.personal.source === 'hr'
    ? `Mobile Number and Date of Birth are saved to HR Employee Master record ${view.employee?.id}.`
    : undefined;

  return (
    <form onSubmit={handleSave} className="space-y-4 text-xs">
      <div className="flex items-center gap-4">
        {shownPhoto
          ? <img src={shownPhoto} alt="Profile preview" className="w-20 h-20 rounded-2xl object-cover border border-slate-200 bg-white" />
          : <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-xl font-black">{initialsOf(view.account.name)}</div>}
        <div className="space-y-1.5">
          <label className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg cursor-pointer">
            <Camera className="w-3.5 h-3.5" /> {view.personal.profilePhoto || photoBlob ? 'Change Photo' : 'Upload Photo'}
            <input type="file" accept="image/jpeg,image/png" onChange={handlePhoto} className="hidden" />
          </label>
          {(photoBlob || (view.personal.profilePhoto && !removePhoto)) && (
            <button type="button" onClick={() => { setPhotoBlob(null); setPhotoPreview(null); setRemovePhoto(!!view.personal.profilePhoto); }} className="block text-[10px] font-bold text-rose-600 hover:underline cursor-pointer">
              Remove photo
            </button>
          )}
          <p className="text-[10px] text-slate-400">JPG or PNG, up to 5MB. {photoBlob ? 'Preview shown - saved when you click Save.' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Mobile Number</label>
          <input value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="10 digits" autoComplete="off" className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 font-mono" />
        </div>
        <div>
          <label className="block font-semibold text-slate-600 mb-1">Date of Birth</label>
          <DateInput value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2" />
        </div>
        <div className="sm:col-span-2">
          <label className="block font-semibold text-slate-600 mb-1">Address</label>
          <textarea value={address} onChange={e => setAddress(e.target.value.slice(0, 300))} rows={3} className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 resize-none" />
        </div>
        {staffOptions && (
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-600 mb-1">HR Employee Master record</label>
            <select value={staffLink} onChange={e => setStaffLink(e.target.value)} className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2">
              <option value="">Automatic (match by login email)</option>
              {staffOptions.map(s => <option key={s.id} value={s.id}>{s.id} - {s.name}{s.email ? ` (${s.email})` : ''}</option>)}
            </select>
          </div>
        )}
      </div>
      {hrNote && <p className="text-[10px] text-slate-500 font-mono">{hrNote}</p>}
      {error && <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-600 to-purple-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
      </div>
    </form>
  );
}

// Read-only profile card (own profile, or the selected user in Manage Profiles).
function ProfileDetails({ view, onEdit }: { view: EmployeeProfileView; onEdit?: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ProfileAvatar name={view.account.name} photo={view.personal.profilePhoto} className="w-20 h-20 rounded-2xl text-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-slate-900 truncate">{view.account.name}</p>
          <p className="text-xs font-semibold text-purple-700">{view.employee?.designation || view.account.departmentLabel}</p>
          <p className="text-[11px] text-slate-500">{view.account.departmentLabel}</p>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="self-start bg-gradient-to-r from-pink-600 to-purple-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer hover:shadow-md">
            <Edit2 className="w-3.5 h-3.5" /> Edit Profile
          </button>
        )}
      </div>

      <section className="border border-slate-200 rounded-xl p-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Home className="w-3.5 h-3.5" /> Personal Information</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full Name" value={view.account.name} />
          <Field label="Date of Birth" value={displayDate(view.personal.dateOfBirth)} />
          <Field label="Mobile Number" value={view.personal.mobile} />
          <Field label="Email" value={view.account.email} />
          <div className="sm:col-span-2"><Field label="Address" value={view.personal.address} /></div>
        </div>
      </section>

      <section className="border border-slate-200 rounded-xl p-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Work Information</p>
        {view.employee ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Employee ID" value={view.employee.id} />
            <Field label="Designation" value={view.employee.designation} />
            <Field label="Department" value={view.account.departmentLabel} />
            <Field label="Company" value={view.employee.orgUnit ? ORG_UNIT_LABEL[view.employee.orgUnit] : undefined} />
            <Field label="Location" value={view.employee.location} />
            <Field label="Date of Joining" value={view.employee.dateOfJoining} />
            <Field label="Employment Type" value={view.employee.employmentType} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Department" value={view.account.departmentLabel} />
            <p className="text-[11px] text-slate-400 sm:col-span-2">No HR Employee Master record is linked to this login - Employee ID, Designation and joining details appear here once HR links one.</p>
          </div>
        )}
      </section>

      <section className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Account &amp; Access</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Login Username" value={view.account.username} />
          <Field label="Role / Department" value={view.account.departmentLabel} />
        </div>
        <p className="text-[10px] text-slate-400 mt-2">Managed by your administrator - these can't be changed from your profile.</p>
      </section>
    </div>
  );
}

function ManageProfiles() {
  const [profiles, setProfiles] = useState<EmployeeProfileView[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    authFetch('/api/employee-profiles')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to load profiles.'); return d; })
      .then(d => { setProfiles(d.profiles); setStaff(d.staffEmployees); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? profiles.filter(p => [p.account.name, p.account.username, p.account.departmentLabel, p.employee?.id].some(v => (v || '').toLowerCase().includes(q))) : profiles;
  }, [profiles, query]);
  const current = profiles.find(p => p.account.username === selected);

  if (loading) return <p className="text-xs text-slate-400 flex items-center gap-2 p-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading profiles...</p>;
  if (error) return <p className="text-xs text-rose-700 p-4">{error}</p>;

  if (current) {
    return (
      <div className="space-y-3">
        <button onClick={() => { setSelected(null); setEditing(false); setSaved(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer">&larr; All profiles</button>
        {saved && <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{saved}</p>}
        {editing ? (
          <ProfileEditForm
            view={current}
            endpoint={`/api/employee-profiles/${encodeURIComponent(current.account.username)}`}
            staffOptions={staff}
            onCancel={() => setEditing(false)}
            onSaved={v => { setProfiles(ps => ps.map(p => p.account.username === v.account.username ? v : p)); setEditing(false); setSaved('Profile saved.'); }}
          />
        ) : (
          <ProfileDetails view={current} onEdit={() => { setEditing(true); setSaved(''); }} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, username, department or Employee ID..." autoComplete="off" className="flex-1 outline-none" />
      </div>
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
        {filtered.map(p => (
          <button key={p.account.username} onClick={() => setSelected(p.account.username)} className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-slate-50 cursor-pointer">
            <ProfileAvatar name={p.account.name} photo={p.personal.profilePhoto} className="w-8 h-8 rounded-lg text-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-800 truncate">{p.account.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{p.account.departmentLabel}{p.employee ? ` · ${p.employee.id}` : ' · no HR record linked'}</p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-xs text-slate-400 p-4 text-center">No matching login users.</p>}
      </div>
    </div>
  );
}

export default function EmployeeProfileModal({ onClose, onProfileChange }: {
  onClose: () => void;
  onProfileChange: (view: EmployeeProfileView) => void;
}) {
  const [view, setView] = useState<EmployeeProfileView | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState<'mine' | 'manage'>('mine');

  useEffect(() => {
    authFetch('/api/profile')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to load your profile.'); return d as EmployeeProfileView; })
      .then(setView)
      .catch(err => setError(err.message));
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 bg-gradient-to-r from-slate-900 to-purple-950 text-white flex items-center justify-between rounded-t-2xl shrink-0">
          <h3 className="font-extrabold text-sm flex items-center gap-2"><UserCircle2 className="w-4 h-4 text-pink-400" /> My Profile</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {view?.canManageProfiles && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 mx-4 mt-4 rounded-lg text-xs font-bold w-fit shrink-0">
            {([['mine', 'My Profile'], ['manage', 'Manage Profiles']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-md cursor-pointer flex items-center gap-1.5 ${tab === key ? 'bg-white shadow-xs text-purple-700' : 'text-slate-500'}`}>
                {key === 'manage' && <Users className="w-3.5 h-3.5" />}{label}
              </button>
            ))}
          </div>
        )}
        <div className="p-4 overflow-y-auto min-h-0">
          {error && <p className="text-xs text-rose-700">{error}</p>}
          {!view && !error && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your profile...</p>}
          {view && tab === 'manage' && <ManageProfiles />}
          {view && tab === 'mine' && (
            <div className="space-y-3">
              {saved && <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{saved}</p>}
              {editing ? (
                <ProfileEditForm
                  view={view}
                  endpoint="/api/profile"
                  onCancel={() => setEditing(false)}
                  onSaved={v => { setView(v); onProfileChange(v); setEditing(false); setSaved('Your profile has been saved.'); }}
                />
              ) : (
                <ProfileDetails view={view} onEdit={() => { setEditing(true); setSaved(''); }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
