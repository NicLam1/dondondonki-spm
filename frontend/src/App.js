import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TasksPage from './pages/TasksPage';
import AuthPage from './pages/AuthPage';
import ChangePassword from './pages/ChangePassword';
import TrashPage from './pages/TrashPage';
import ProjectsPage from './pages/ProjectPage';
import ProjectComp from './components/ProjectComp';
import CalendarPage from './pages/CalendarPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/project/:projectName" element={<ProjectComp />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/trash" element={<TrashPage />} /> 
      </Routes>
    </BrowserRouter>
  );
}
