INSERT INTO usuarios (nome, email, senha_hash, funcao, status, created_at, updated_at)
VALUES ('Administrador', 'admin@duofuturo.com', '$2a$10$7ZqpC7JKqC7q4d4fF5RQXuO0wYq7Yd6Z8.j0Q.Y8QoD3fK5m5T7jC', 'ADMIN', 'ATIVO', now(), now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO usuarios (nome, email, senha_hash, telefone, funcao, taxa_horaria, comissao_percentual, especialidades, status, created_at, updated_at)
VALUES ('Carlos Mendes', 'carlos@duofuturo.com', '$2a$10$7ZqpC7JKqC7q4d4fF5RQXuO0wYq7Yd6Z8.j0Q.Y8QoD3fK5m5T7jC', '11987654321', 'MENTOR', 350.00, 15.00, 'Liderança, Gestão de Equipes', 'ATIVO', now(), now())
ON CONFLICT (email) DO NOTHING;
