import { describe, expect, it } from 'vitest';
import { origensPermitidas } from './cors.js';

describe('origensPermitidas', () => {
  it('lê uma origem', () => {
    expect(origensPermitidas('http://localhost:5173')).toEqual(['http://localhost:5173']);
  });

  it('separa várias origens por vírgula e ignora espaços', () => {
    expect(
      origensPermitidas(' http://localhost:5173 , https://squad-ses-frontend.vercel.app '),
    ).toEqual(['http://localhost:5173', 'https://squad-ses-frontend.vercel.app']);
  });

  it('remove a barra final, que o navegador não manda', () => {
    expect(origensPermitidas('https://squad-ses-frontend.vercel.app/')).toEqual([
      'https://squad-ses-frontend.vercel.app',
    ]);
  });

  it.each([undefined, '', ' , '])('devolve lista vazia para %j', (valor) => {
    expect(origensPermitidas(valor)).toEqual([]);
  });
});
