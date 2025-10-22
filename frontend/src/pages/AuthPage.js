import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, TextField, Typography, Paper, Tabs, Tab, MenuItem } from "@mui/material";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000/api";

export default function AuthPage({ onAuth }) {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "STAFF" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (tab === 1 && form.password.length < 8) {
      setError("Your password is too short. Please enter at least 8 characters.");
      return;
    }
    const endpoint = tab === 0 ? "/auth/signin" : "/auth/signup";
    try {
      // Map role to access_level
      let access_level = 0;
      if (form.role === "STAFF") access_level = 0;
      else if (form.role === "MANAGER") access_level = 1;
      else if (form.role === "DIRECTOR") access_level = 2;
      else if (form.role === "HR") access_level = 3; // NEW: Add HR mapping

      const payload = tab === 1
        ? { ...form, access_level }
        : form;

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        // Friendly error for duplicate email
        if (data.error && data.error.toLowerCase().includes("email")) {
          setError("This email is already registered. Please use a different email or log in.");
        } else {
          setError(data.error || "An unexpected error occurred. Please try again.");
        }
        return;
      }
      localStorage.setItem("user", JSON.stringify({
        ...data.user,
        ...(data.profile ? { profile: data.profile } : {})
      }));
      if (onAuth) onAuth({
        ...data.user,
        ...(data.profile ? { profile: data.profile } : {})
      });
      navigate("/tasks");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <Paper sx={{ p: 4, minWidth: 320 }} elevation={3}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered>
          <Tab label="Login" />
          <Tab label="Sign Up" />
        </Tabs>
        <form onSubmit={handleSubmit}>
          <TextField
            margin="normal"
            fullWidth
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
          />
          <TextField
            margin="normal"
            fullWidth
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
          />
          {tab === 1 && (
            <>
              <TextField
                margin="normal"
                fullWidth
                label="Full Name"
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                required
              />
              <TextField
                margin="normal"
                fullWidth
                select
                label="Role"
                name="role"
                value={form.role}
                onChange={handleChange}
                required
              >
                <MenuItem value="STAFF">STAFF</MenuItem>
                <MenuItem value="MANAGER">MANAGER</MenuItem>
                <MenuItem value="DIRECTOR">DIRECTOR</MenuItem>
                <MenuItem value="HR">HR</MenuItem>
              </TextField>
            </>
          )}
          {error && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
          <Button type="submit" variant="contained" color="primary" fullWidth sx={{ mt: 2 }}>
            {tab === 0 ? "Login" : "Sign Up"}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
