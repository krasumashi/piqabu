import { Navigate, Route, Routes } from 'react-router-dom';
import { getAdminKey } from './lib/api';
import Layout from './components/Layout';
import Login from './routes/Login';
import Pulse from './routes/Pulse';
import Devices from './routes/Devices';
import Helpdesk from './routes/Helpdesk';
import Levers from './routes/Levers';
import Audit from './routes/Audit';
import Insights from './routes/Insights';

function RequireAuth({ children }: { children: JSX.Element }) {
    return getAdminKey() ? children : <Navigate to="/login" replace />;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route
                element={
                    <RequireAuth>
                        <Layout />
                    </RequireAuth>
                }
            >
                <Route path="/pulse" element={<Pulse />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/helpdesk" element={<Helpdesk />} />
                <Route path="/levers" element={<Levers />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/" element={<Navigate to="/pulse" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
