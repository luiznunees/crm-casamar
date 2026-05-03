import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Building2, Mail, Lock, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/');
      window.location.reload(); // Garante que o estado global seja limpo
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao entrar. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Building2 size={32} color="var(--primary)" />
          </div>
          <h1>CRM Casamar</h1>
          <p>Entre para gerenciar seus leads e campanhas</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && <div className="login-error">{error}</div>}
          
          <div className="form-group">
            <label>E-mail</label>
            <div className="input-with-icon">
              <Mail size={18} />
              <input 
                type="email" 
                placeholder="seu@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Senha</label>
            <div className="input-with-icon">
              <Lock size={18} />
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="login-footer">
          &copy; {new Date().getFullYear()} Casamar Exclusividades
        </div>
      </div>

      <style>{`
        .login-layout {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #0d0d1a;
          color: #e2e2ff;
          font-family: 'Inter', sans-serif;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 40px;
          background: #13131f;
          border: 1px solid #1e1e35;
          border-radius: 16px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .login-logo {
          width: 64px;
          height: 64px;
          background: rgba(124, 106, 247, 0.1);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }
        .login-header h1 {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .login-header p {
          color: #9090b0;
          font-size: 14px;
        }
        .login-form .form-group {
          margin-bottom: 20px;
        }
        .login-form label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #7070a0;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-with-icon svg {
          position: absolute;
          left: 12px;
          color: #505070;
        }
        .input-with-icon input {
          width: 100%;
          padding: 12px 12px 12px 42px;
          background: #0d0d1a;
          border: 1px solid #313147;
          border-radius: 8px;
          color: white;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-with-icon input:focus {
          border-color: var(--primary);
        }
        .login-error {
          padding: 10px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 20px;
          text-align: center;
        }
        .login-footer {
          margin-top: 32px;
          text-align: center;
          font-size: 12px;
          color: #505070;
        }
        .btn-block {
          width: 100%;
          padding: 12px;
          font-weight: 600;
          margin-top: 8px;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
