import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import MilestonePage from './pages/MilestonePage'
import EmployeePage from './pages/EmployeePage'
import PeoplePage from './pages/PeoplePage'
import TimeLogPage from './pages/TimeLogPage'
import UsersPage from './pages/UsersPage'
import NotFoundPage from './pages/NotFoundPage'
import './App.css'

/**
 * Routes: /login is public; everything else requires a session.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="milestones/:milestoneId" element={<MilestonePage />} />
          <Route path="employees" element={<PeoplePage />} />
          <Route path="employees/:employeeId" element={<EmployeePage />} />
          <Route path="employees/:employeeId/time-log" element={<TimeLogPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
