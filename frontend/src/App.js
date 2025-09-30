import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TasksPage from './pages/TasksPage';
import TrashPage from './pages/TrashPage'; 

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TasksPage />} />
        <Route path="/trash" element={<TrashPage />} /> 
      </Routes>
    </BrowserRouter>
  );
}
