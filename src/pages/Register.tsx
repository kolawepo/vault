import { useNavigate } from "react-router-dom";
import vaultLogo from "../assets/vault-logo.png";
import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../firebase";

function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async () => {
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: fullName });
      window.location.href = "/dashboard";
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <main className="landing-page">
      <section className="landing-content">
        <img
          src={vaultLogo}
          alt="Vault"
          className="auth-logo"
        />

        <h1>Create Account</h1>

        <p>Start organizing your important files.</p>

        <input
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
<input
  placeholder="Email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  />
  
<input
  placeholder="Password"
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>
        <button
  className="google-btn"
  onClick={handleRegister}
>
  Create Account
</button>

        <p className="login-text">
          Already have an account?{" "}
          <span onClick={() => navigate("/login")}>
            Log In
          </span>
        </p>
      </section>
    </main>
  );
}

export default Register;