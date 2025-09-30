import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TasksPage from './pages/TasksPage';
import AuthPage from './pages/AuthPage';
import ChangePassword from './pages/ChangePassword';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/change-password" element={<ChangePassword />} />
      </Routes>
    </BrowserRouter>
  );
}
