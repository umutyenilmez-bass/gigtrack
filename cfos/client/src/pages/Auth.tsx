import React from 'react';
import Home from './Home';

export default function Auth() {
  if (!localStorage.getItem('token')) {
    localStorage.setItem('token', 'local_bypass_jwt_token');
    localStorage.setItem('username', 'Kullanıcı');
  }
  return <Home />;
}
