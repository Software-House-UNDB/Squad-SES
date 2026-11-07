import { Routes, Route } from 'react-router-dom';
import { Pen, User, Settings } from 'lucide-react';
import Login from './pages/Login.tsx';
import Cadastro from './pages/Cadastro.tsx';
import CadastroSucesso from './pages/CadastroSucesso.tsx';
import Dashboard from './pages/Dashboard.tsx';
import AcessoNegado from './pages/AcessoNegado.tsx';
import AppShell from './components/layout/AppShell.tsx';
import OficiosLista from './pages/Oficios/OficiosLista.tsx';
import Placeholder from './pages/Placeholder.tsx';
import ProtectedRoute from './routes/ProtectedRoute.tsx';
import RootRedirect from './routes/RootRedirect.tsx';
import { ACCESS } from './routes/permissions.ts';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/cadastro/sucesso" element={<CadastroSucesso />} />
      <Route path="/acesso-negado" element={<AcessoNegado />} />

      {/* Qualquer usuário autenticado */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />

        <Route element={<AppShell />}>
          <Route element={<ProtectedRoute perfis={ACCESS.analiseOficios} />}>
            <Route path="/gerenciamento/analise-oficios" element={<OficiosLista />} />
          </Route>

          <Route element={<ProtectedRoute perfis={ACCESS.assinaturaTermos} />}>
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
          </Route>

          <Route element={<ProtectedRoute perfis={ACCESS.administracao} />}>
            <Route
              path="/administracao/usuarios"
              element={
                <Placeholder
                  icon={User}
                  title="Usuários"
                  breadcrumb={['Administração', 'Usuários']}
                />
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
        </Route>
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
