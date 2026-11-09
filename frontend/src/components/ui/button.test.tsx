import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renderiza o texto recebido', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('aplica a variante default por padrão', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary');
  });

  it('aplica a variante informada', () => {
    render(<Button variant="destructive">Excluir</Button>);
    expect(screen.getByRole('button')).toHaveClass('text-destructive');
  });

  it('dispara onClick ao ser clicado', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fica desabilitado quando a prop disabled é passada', () => {
    render(<Button disabled>Salvar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
