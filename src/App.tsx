import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (user === undefined) return null;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
      <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;