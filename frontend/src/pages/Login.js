import React, { useState } from 'react';
import { FiShield, FiMail, FiLock, FiLogIn } from 'react-icons/fi';
import { login } from '../services/api';
import '../styles/Login.css';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(email, password);
      localStorage.setItem('token', res.data.token);
      onLogin(res.data.user);
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed. Please try again.';
      setError(message);
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFill = () => {
    setEmail('demo@accessibility.com');
    setPassword('password123');
    setError('');
  };

  return (
    <div className="login-page">
      <div className="login-bg-overlay"></div>

      <div className={`login-card ${shake ? 'shake' : ''}`}>
        <div className="login-header">
          <div className="login-logo">
            <FiShield className="shield-icon" />
          </div>
          <h1 className="login-title">AI Accessibility Audit</h1>
          <p className="login-subtitle">Sign in to your account</p>
        </div>

        {error && (
          <div className="login-error">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-wrapper">
              <FiMail className="input-icon" />
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <FiLock className="input-icon" />
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <div className="btn-spinner"></div>
            ) : (
              <>
                <FiLogIn className="btn-icon" />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button type="button" className="demo-btn" onClick={handleAutoFill}>
          Auto Fill Demo
        </button>

        <p className="login-footer">
          AI-Powered Accessibility Compliance Platform
        </p>
      </div>
    </div>
  );
}

export default Login;
