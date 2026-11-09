// Perfis com login no piloto (RF-01, RF-02). Os signatários pontuais (supervisor, diretor da ESP-MA, estagiário)
// não têm perfil: acessam por link único (RF-04), ver rota /assinar/:token.
export type Perfil = 'coordenacao_ses' | 'representante_ies';

export interface Usuario {
  id: string;
  email: string;
  perfil: Perfil;
  instituicao: string | null;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload {
  email: string;
  senha: string;
}

export interface LoginResponse extends Tokens {
  usuario: Usuario;
}
