import { Routes, Route, Navigate } from 'react-router-dom';
import { Pen, User, Settings } from 'lucide-react';
import Login from './pages/Login.tsx';
import Cadastro from './pages/Cadastro.tsx';
import CadastroSucesso from './pages/CadastroSucesso.tsx';
import Dashboard from './pages/Dashboard.tsx';
import AppShell from './components/layout/AppShell.tsx';
import OficiosLista from './pages/Oficios/OficiosLista.tsx';
import Placeholder from './pages/Placeholder.tsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/cadastro/sucesso" element={<CadastroSucesso />} />
      <Route path="/dashboard" element={<Dashboard />} />

      <Route element={<AppShell />}>
        <Route path="/gerenciamento/analise-oficios" element={<OficiosLista />} />
        <Route
          path="/gerenciamento/assinatura-termos"
          element={
            <Placeholder
              icon={Pen}
              title="Assinatura de Termos"
              breadcrumb={['Gerenciamento', 'Assinatura de Termos']}
            />
          }
        />
        <Route
          path="/administracao/usuarios"
          element={
            <Placeholder icon={User} title="Usuários" breadcrumb={['Administração', 'Usuários']} />
          }
        />
        <Route
          path="/administracao/configuracoes"
          element={
            <Placeholder
              icon={Settings}
              title="Configurações"
              breadcrumb={['Administração', 'Configurações']}
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
