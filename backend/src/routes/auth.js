const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Sign out route
router.post('/signout', async (req, res) => {
	const { error } = await supabase.auth.signOut();
	if (error) return res.status(400).json({ error: error.message });
	res.json({ message: 'Signed out successfully' });
});

// Sign up route
router.post('/signup', async (req, res) => {
		const { email, password, full_name, role, access_level } = req.body;
		// Create user in Supabase Auth
		const { data, error } = await supabase.auth.signUp({ email, password });
		if (error) {
			console.error('Supabase Auth signup error:', error);
			return res.status(400).json({ error: error.message || 'Failed to create user in Supabase Auth.' });
		}
		const user = data.user || data;
		// Insert profile info into custom user table
		if (user && user.id) {
			const { error: profileError, data: profileData } = await supabase
				.from('users')
				.insert([
					{
						email,
						full_name,
						role,
						access_level,
						created_at: new Date().toISOString(),
					},
				]);
				if (profileError) {
					console.error('Supabase users table insert error:', profileError);
					// Detect RLS (row-level security) error
					if (profileError.message && profileError.message.toLowerCase().includes('row-level security')) {
						return res.status(400).json({ error: 'Signup failed due to database permissions. Please contact support.' });
					}
					// If duplicate email, return a friendly message
					if (profileError.message && profileError.message.toLowerCase().includes('duplicate')) {
						return res.status(400).json({ error: 'This email is already registered in the users table.' });
					}
					return res.status(400).json({ error: profileError.message || 'Failed to create user profile.' });
				}
		}
		res.json({ user });
});

// Sign in route
router.post('/signin', async (req, res) => {
	const { email, password } = req.body;
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) return res.status(400).json({ error: error.message });
	// Fetch profile info from custom user table
			const { data: profile, error: profileError } = await supabase
				.from('users')
				.select('*')
				.eq('email', email)
				.single();
	if (profileError) return res.status(400).json({ error: profileError.message });
	res.json({ session: data.session, user: data.user, profile });
});


// Change password route

router.post('/change-password', async (req, res) => {
	const { email, old_password, new_password } = req.body;
	if (!email || !old_password || !new_password) {
		return res.status(400).json({ error: 'Email, old password, and new password are required.' });
	}
	if (new_password.length < 8) {
		return res.status(400).json({ error: 'New password must be at least 8 characters.' });
	}
	if (old_password === new_password) {
		return res.status(400).json({ error: 'New password must be different from old password.' });
	}
	// Re-authenticate user with old password
	const { data, error } = await supabase.auth.signInWithPassword({ email, password: old_password });
	if (error || !data.session) {
		return res.status(400).json({ error: 'Old password is incorrect.' });
	}
	const access_token = data.session.access_token;
	// Update password
	const { error: updateError } = await supabase.auth.updateUser(
		{ password: new_password },
		{ access_token }
	);
	if (updateError) {
		return res.status(400).json({ error: updateError.message || 'Failed to change password.' });
	}
	res.json({ message: 'Password changed successfully.' });
});

module.exports = router;
