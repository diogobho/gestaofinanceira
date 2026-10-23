-- 104: duração da reunião (06/10/2026). A tarefa não tinha duração e todo evento ia para a
-- agenda externa (103) com 1h. Tabela à parte, e não coluna em tarefas_lead, porque a dona
-- de tarefas_lead é o postgres. Sem linha = 60 min.
CREATE TABLE IF NOT EXISTS tarefas_reuniao (
  tarefa_id    INTEGER PRIMARY KEY,
  duracao_min  INTEGER NOT NULL CHECK (duracao_min BETWEEN 5 AND 480)
);
