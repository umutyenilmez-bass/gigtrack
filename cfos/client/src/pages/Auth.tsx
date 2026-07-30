import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Bot, Key, Sparkles, User, Loader2, Lock, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Auth() {
  const [error, setError] = useState('');
  const [, setLocation] = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const usernameParam = params.get('username');
    if (token && usernameParam) {
      localStorage.setItem('token', token);
      localStorage.setItem('username', usernameParam);
      setLocation('/');
    }
  }, [setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Lütfen kullanıcı adı ve şifre girin.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Giriş yapılamadı.');
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      setLocation('/');
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestLogin = async () => {
    setLoading(true);
    setError('');
    try {
      // Try to register first
      let res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' })
      });
      let data = await res.json();
      
      if (!res.ok) {
        // If user already exists, try logging in
        res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'testuser', password: 'password123' })
        });
        data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Test girişi yapılamadı.');
        }
      }
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      setLocation('/');
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-xl border-slate-700/50 shadow-2xl p-8 rounded-3xl text-white">
        {/* Title */}
        <div className="text-center mb-6">
          <img src="/CfOS-logo.png" alt="CfOS Logo" className="mx-auto h-16 w-auto mb-3 object-contain" />
          <h2 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-200 bg-clip-text text-transparent flex items-center justify-center gap-2">
            CfOS <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Yapay zeka destekli borç ve bütçe yönetim sistemi
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert className="mb-4 bg-red-500/20 border-red-500/30 text-red-200">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-4">
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Kullanıcı Adı</Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="kullanici_adi"
                className="bg-white/5 border-white/10 pl-9 text-sm h-9 text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Şifre</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="bg-white/5 border-white/10 pl-9 text-sm h-9 text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-xl flex items-center justify-center gap-2 transition-all text-xs h-9"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {isRegister ? 'Kayıt Ol' : 'Giriş Yap'} <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </Button>

          {/* Quick Bypass Button */}
          <Button
            type="button"
            onClick={handleTestLogin}
            disabled={loading}
            className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold py-2 rounded-xl flex items-center justify-center gap-2 border border-amber-500/20 transition-all text-xs h-9"
          >
            <Bot className="w-4 h-4" /> Tek Tıkla Test Hesabı ile Giriş (Bypass)
          </Button>
        </form>

        <div className="text-center mb-6">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-blue-400 hover:underline transition-all"
          >
            {isRegister ? 'Zaten hesabınız var mı? Giriş Yapın' : 'Hesabınız yok mu? Yeni Hesap Oluşturun'}
          </button>
        </div>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-white/10"></div>
          <span className="flex-shrink mx-4 text-slate-500 text-[10px] uppercase font-bold tracking-wider">veya</span>
          <div className="flex-grow border-t border-white/10"></div>
        </div>

        {/* Google OAuth Login */}
        <Button
          type="button"
          onClick={() => window.location.href = '/api/auth/google'}
          className="w-full bg-white text-slate-950 hover:bg-slate-100 font-semibold py-2 rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition-all duration-150 active:scale-95 shadow-md text-xs h-9 mt-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.51 0-6.357-2.829-6.357-6.32s2.848-6.32 6.357-6.32c1.614 0 3.085.6 4.225 1.571l3.076-3.076C18.665 1.77 15.65 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.48 0 10.785-4.56 10.785-10.97 0-.74-.06-1.425-.195-2.225H12.24z"
            />
          </svg>
          Google ile Devam Et
        </Button>
      </Card>
    </div>
  );
}
