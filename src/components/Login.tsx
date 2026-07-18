import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, KeyRound, ShieldAlert, CheckCircle2, ArrowRight, HelpCircle, Eye, EyeOff, RefreshCw, Undo2 } from 'lucide-react';
import { User as UserType } from '../types';
import kcmLogo from '../assets/images/logo.jpg';
import AnimatedLorry from './AnimatedLorry';
import companyTruck from '../assets/images/kcm_clean_truck_1784109835356.jpg';

interface LoginProps {
  onLoginSuccess: (user: UserType) => void;
}

const PRESET_CREDS = [
  { id: 'super2', label: 'Super Admin Principal', role: 'super_admin', email: 'superapp@kcmlogistics.in', pass: 'super123' },
  { id: 'vdm1', label: 'Vehicle Manager (Ravi K.)', role: 'vehicle_manager', email: 'ravi.kumar@kcmlogistics.in', pass: 'vdm123' },
  { id: 'fuel1', label: 'Fuel Manager (Anil S.)', role: 'fuel_management', email: 'anil.singh@kcmlogistics.in', pass: 'fuel123' },
  { id: 'billing1', label: 'Billing Officer (Meena I.)', role: 'billing', email: 'meena.iyer@kcmlogistics.in', pass: 'bill123' },
  { id: 'petty1', label: 'Petty Cash Desk (Amit V.)', role: 'petty_cash', email: 'amit.verma@kcmlogistics.in', pass: 'petty123' },
  { id: 'maint1', label: 'Maintenance Garage (Baldev S.)', role: 'maintenance', email: 'baldev.singh@kcmlogistics.in', pass: 'maint123' },
  { id: 'accounts1', label: 'Accounts & Finance (Lokesh P.)', role: 'accounts_finance', email: 'lokesh.patel@kcmlogistics.in', pass: 'acct123' },
  { id: 'hr1', label: 'HR Director (Kavitha N.)', role: 'hr', email: 'kavitha.nair@kcmlogistics.in', pass: 'hr123' },
  { id: 'admin1', label: 'Administration Desk (Rajesh N.)', role: 'administration', email: 'rajesh.nair@kcmlogistics.in', pass: 'admin123' },
];

export default function Login({ onLoginSuccess }: LoginProps) {
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signin'>('login');
  const [otpSentMsg, setOtpSentMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Forgot Password Mode states
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotOtpSent, setForgotOtpSent] = useState(false);

  // Auto-fill preset helper
  const handleSelectPreset = async (preset: typeof PRESET_CREDS[0]) => {
    setError(null);
    setSuccess(null);
    setEmailInput(preset.email);
    setPassword(preset.pass);
    setIsForgotPassword(false);
    setAuthMode('signin');

    setIsLoading(true);
    try {
      const res = await fetch('/api/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: preset.email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOtpSentMsg(true);
        setSuccess(`A secure OTP has been sent to ${preset.email}. Please check your email.`);
      } else {
        setError(data.error || 'Failed to request security OTP.');
      }
    } catch (err) {
      setError('Connection to security server failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Request standard OTP
  const handleRequestOtp = async () => {
    if (!emailInput) {
      setError('Please fill in your Email ID before requesting an OTP.');
      return;
    }
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setOtpSentMsg(true);
        setSuccess(`A 6-digit OTP security code has been dispatched to ${emailInput}. Please check your email.`);
      } else {
        setError(data.error || 'No registered account found with that email.');
      }
    } catch (err) {
      setError('Failed to reach authentication servers.');
    } finally {
      setIsLoading(false);
    }
  };

  // Request Forgot Password reset code
  const handleRequestResetOtp = async () => {
    if (!forgotEmail) {
      setError('Please provide your email address first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setForgotOtpSent(true);
        setSuccess(`Verification code has been sent to your email. Please check your inbox.`);
      } else {
        setError(data.error || 'No account registered with this email.');
      }
    } catch (err) {
      setError('Failed to connect to security core.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Forgot Password Form Submission
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail || !forgotOtp || !forgotNewPassword) {
      setError('All fields are required.');
      return;
    }
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          otp: forgotOtp,
          newPassword: forgotNewPassword
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess('Your password has been reset successfully! You can now log in.');
        // Switch back to normal login and autofill the new credentials
        setEmailInput(forgotEmail);
        setPassword(forgotNewPassword);
        setIsForgotPassword(false);
        setForgotOtpSent(false);
        setOtp('');
        setOtpSentMsg(false);
      } else {
        setError(data.error || 'Failed to reset password. Check your code and try again.');
      }
    } catch (err) {
      setError('An error occurred during password resetting.');
    } finally {
      setIsLoading(false);
    }
  };

  // Standard Login Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'signin') {
      if (!emailInput || !password || !otp) {
        setError('Email, Password, and OTP Code are required to sign in.');
        return;
      }
    } else {
      if (!emailInput || !password) {
        setError('Email and Password are required to log in.');
        return;
      }
    }

    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const payload: any = { username: emailInput, password };
      if (authMode === 'signin') {
        payload.otp = otp;
      }
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (rememberMe) {
          localStorage.setItem('kcm_session_user', JSON.stringify(data.user));
        } else {
          localStorage.removeItem('kcm_session_user');
        }
        onLoginSuccess(data.user);
      } else {
        const errMsg = data.error || (authMode === 'signin' ? 'Incorrect Email ID, Password, or OTP.' : 'Incorrect Email ID or Password.');
        setError(errMsg);
        
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);

        if (newAttempts >= 3) {
          await fetch('/api/notify-abnormal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: emailInput,
              reason: `Multiple consecutive failed logins (${newAttempts} attempts) for email "${emailInput}". IP locked and flagged.`
            }),
          });
          setError('Abnormal login activity detected. Alert notification dispatched to Super Admin.');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection to security server failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 text-slate-800 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      {/* Dynamic, vibrant colorful pink and purple background gradients */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-r from-pink-500 via-fuchsia-600 to-purple-700 transform -skew-y-3 z-0 shadow-lg" />
      <div className="absolute top-10 right-10 w-96 h-96 bg-pink-400/20 rounded-full filter blur-3xl animate-pulse" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-purple-400/20 rounded-full filter blur-3xl" />

      {/* Main Container */}
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-pink-100 p-8 z-10 relative mt-6 transition-all duration-300 hover:shadow-pink-100/50 hover:shadow-2xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-44 h-24 bg-white rounded-xl overflow-hidden border border-slate-200/60 mb-4 shadow-md flex items-center justify-center p-1 relative">
            <img
              src={companyTruck}
              alt="KCM Company Truck"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
            {/* Seamless, borderless text printed directly on the truck cargo container */}
            <div 
              className="absolute top-[35%] left-[22.5%] w-[31.5%] h-[21%] bg-white flex flex-col items-center justify-center select-none"
              style={{ transform: 'rotate(-0.5deg)' }}
            >
              <span className="text-[14px] font-extrabold text-emerald-600 tracking-tight leading-none">
                KCM
              </span>
              <span className="text-[5px] font-extrabold text-emerald-600 tracking-widest uppercase leading-none mt-0.5">
                LOGISTICS
              </span>
            </div>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-amber-500 to-red-600 uppercase">KCM LOGISTICS</h2>
          <p className="text-[10px] text-emerald-600 font-bold tracking-widest uppercase mt-0.5">Official Fleet Portal</p>
        </div>

        {/* Dynamic Alerts */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3.5 bg-pink-50 border border-pink-200 text-pink-800 rounded-xl text-xs leading-relaxed flex items-start space-x-2"
          >
            <ShieldAlert className="w-4 h-4 text-pink-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Notice:</span> {error}
            </div>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-3.5 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-xs leading-relaxed"
          >
            <div className="flex items-center space-x-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
              <span className="font-bold text-purple-800">Dispatch Notification</span>
            </div>
            <p className="text-slate-600">{success}</p>
          </motion.div>
        )}

        {!isForgotPassword && (
          <div className="flex bg-slate-100 p-1 rounded-xl mb-6 border border-purple-100">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                authMode === 'login'
                  ? 'bg-white text-pink-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Daily Login
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                authMode === 'signin'
                  ? 'bg-white text-purple-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              New Employee Sign-In
            </button>
          </div>
        )}

        {!isForgotPassword ? (
          /* Normal Login Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                Corporate Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-purple-400 pointer-events-none">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="login_email"
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value.toLowerCase().trim())}
                  placeholder="e.g. superapp@kcmlogistics.in"
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 focus:bg-white transition-all font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-xs font-semibold text-pink-600 hover:text-pink-700 transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-purple-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 focus:bg-white transition-all font-mono text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-purple-400 hover:text-purple-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* OTP section */}
            {authMode === 'signin' && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-700">
                    Secure email OTP
                  </label>
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center space-x-1 hover:underline cursor-pointer"
                    disabled={isLoading}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Get OTP Code</span>
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-purple-400 pointer-events-none">
                    <KeyRound className="w-4 h-4" />
                  </span>
                  <input
                    id="otp"
                    type="text"
                    pattern="[0-9]*"
                    maxLength={6}
                    required={authMode === 'signin'}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit email authentication code"
                    className="w-full bg-slate-50 border border-purple-100 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 focus:bg-white transition-all font-mono font-bold tracking-widest text-center text-purple-900"
                  />
                </div>
              </div>
            )}

            {/* Remember session options */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <label className="flex items-center space-x-2 text-purple-600 font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-purple-300 text-pink-600 focus:ring-pink-500"
                />
                <span>Remember session</span>
              </label>
              <div className="text-purple-400 flex items-center space-x-1 font-mono text-[10px]">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{authMode === 'signin' ? 'Dual 2-FA Protection' : 'Standard Protection'}</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="login_submit_btn"
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-700 hover:from-pink-700 hover:to-purple-800 text-white rounded-lg py-3 text-xs font-bold tracking-wider uppercase transition-all shadow-md hover:shadow-lg hover:shadow-pink-200 mt-6 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <span>{authMode === 'signin' ? 'Verify & Sign In' : 'Verify & Log In'}</span>
                  <ArrowRight className="w-4 h-4 text-pink-200 animate-pulse" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Forgot Password / Reset Form */
          <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
            <div className="flex items-center justify-between border-b border-pink-100 pb-2 mb-2">
              <h3 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-purple-800 flex items-center gap-1">
                Password Recovery
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(false);
                  setError(null);
                  setSuccess(null);
                }}
                className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 font-semibold"
              >
                <Undo2 className="w-3.5 h-3.5" /> Back
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-normal mb-3">
              Enter your registered email below to receive a secure recovery OTP. Use it to configure your new account password instantly.
            </p>

            {/* Recovery Email */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                Your Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-purple-400 pointer-events-none">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value.toLowerCase().trim())}
                  placeholder="e.g. superapp@kcmlogistics.in"
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 focus:bg-white transition-all font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Trigger code button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRequestResetOtp}
                className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center space-x-1 hover:underline"
                disabled={isLoading}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Send Reset OTP</span>
              </button>
            </div>

            {/* OTP verification */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                Verification OTP Code
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-purple-400 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit recovery OTP"
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 focus:bg-white transition-all font-mono font-bold tracking-widest text-center text-purple-900"
                />
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-purple-700 mb-1">
                New Security Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-purple-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-slate-50 border border-purple-100 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 focus:bg-white transition-all font-mono text-slate-800"
                />
              </div>
            </div>

            {/* Submit password change */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-700 hover:from-pink-700 hover:to-purple-800 text-white rounded-lg py-3 text-xs font-bold tracking-wider uppercase transition-all shadow-md hover:shadow-lg hover:shadow-pink-200 mt-4 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <span>Save Password & Login</span>
                  <CheckCircle2 className="w-4 h-4 text-pink-200" />
                </>
              )}
            </button>
          </form>
        )}



        {/* Audit Footer */}
        <div className="mt-6 border-t border-purple-100 pt-4 text-center">
          <p className="text-[10px] text-purple-400 leading-normal font-medium">
            Authorized portal. All connections are secured via dual-layer 2-FA and audited dynamically.
          </p>
        </div>
      </div>
    </div>
  );
}
