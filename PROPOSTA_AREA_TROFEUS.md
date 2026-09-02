# Proposta futura: área Troféus e estatísticas por tarefa

**Status:** ideia de produto documentada; não implementar agora

**Data:** 1º de setembro de 2026

**Nome provisório:** `Troféus`. Antes da implementação, ainda pode ser comparado com nomes como `Conquistas` ou `Estatísticas`.

## 1. Decisão de produto

As estatísticas detalhadas não devem transformar o **Open task** em uma tela de análise.

- **Open task:** visualizar o estado atual, controlar e editar a tarefa.
- **Troféus:** consultar conquistas, histórico e todos os números da tarefa.

O Open task continua sendo o caminho operacional. Ele pode mostrar somente informações úteis para a ação atual, como progresso do dia, subtarefas, horário, repetição, data final e controles. O botão `Edit task` permanece no final.

Enquanto a área Troféus não existir, os números simples que já aparecem no Open task podem permanecer. Na implementação futura, deve ser reavaliado se `Streak` e `Finished` continuam como resumo curto ou migram integralmente para Troféus.

## 2. Estrutura recomendada da área Troféus

A área deve ser somente de leitura. A edição continua pertencendo ao Open task/Edit task.

Ela pode ter dois níveis:

1. **Visão geral:** conquistas recentes, selos obtidos e uma lista para escolher a tarefa.
2. **Detalhe da tarefa:** todos os números da tarefa escolhida, organizados pelo tipo.

A posição definitiva na navegação fica pendente. A opção preferencial é abrir Troféus pelo Perfil ou por um atalho dedicado, evitando adicionar uma nova aba inferior antes de validar o espaço e a frequência de uso.

## 3. Seletor de período

No detalhe da tarefa, o seletor aparece no topo, logo abaixo do cabeçalho:

```text
[ Week | Month | Year | Total ]
```

- **Week:** semana atual no calendário local.
- **Month:** mês atual.
- **Year:** ano atual.
- **Total:** desde a data inicial da tarefa.

Em uma primeira versão, semana, mês e ano significam o período atual. Navegação para períodos anteriores pode ser acrescentada depois, sem fazer parte do escopo inicial.

### Números afetados pelo período

- Finished
- Scheduled
- Missed
- Success rate
- Quantidade acumulada
- Tempo acumulado
- Média do período
- Melhor dia do período
- Estatísticas periódicas de cada subtask

### Números que permanecem gerais

- Current streak
- Best streak
- Latest milestone
- Next milestone
- Remaining to milestone
- Milestones earned
- Start date
- End date
- Last finished
- Active for

Selecionar `Week` não limita o Best streak àquela semana.

## 4. Estrutura do detalhe de uma tarefa

```text
Nome da tarefa
Horário · Repetição

[ Week | Month | Year | Total ]

PERIOD
STREAKS
MILESTONES
TYPE DETAILS
SUBTASKS, quando existirem
HISTORY
```

As seções sem significado para o tipo da tarefa não aparecem. A interface deve privilegiar rótulos e números, sem ícones decorativos obrigatórios.

## 5. Estatísticas comuns às tarefas recorrentes

### Period

```text
Finished             4
Scheduled            5
Missed               1
Success rate        80%
```

- **Finished:** número de ocorrências concluídas dentro do período.
- **Scheduled:** ocorrências programadas que já chegaram ao momento de avaliação.
- **Missed:** ocorrências encerradas sem conclusão.
- **Success rate:** `Finished / (Finished + Missed)`.

Uma ocorrência de hoje que ainda pode ser cumprida não entra como Missed e não reduz a taxa antes de o dia terminar.

### Streaks

```text
Current streak       8
Best streak         21
```

- **Current streak:** sequência atual de ocorrências programadas concluídas.
- **Best streak:** maior sequência já alcançada.
- Não haverá **Last streak**.
- Dias em que a tarefa não estava programada não quebram a sequência.
- Uma ocorrência aberta no dia atual não quebra o streak antes de o dia terminar.

### Milestones

```text
Latest milestone    50
Next milestone     100
Remaining           34
Milestones earned    2
```

Os marcos seguem a regra já definida: `10`, depois `50`, `100`, `150` e assim por diante, de 50 em 50. Nesta tela podem ser apresentados apenas os números; o desenho do selo é opcional na galeria de conquistas.

### History

```text
Start date          10 Aug 2026
End date            20 Dec 2026
Last finished       Today
Active for          22 days
```

- End date aparece somente quando existir.
- Active for termina em hoje para uma tarefa ativa e na data final para uma tarefa encerrada.

## 6. Tarefa recorrente normal

Uma tarefa normal sem medição ou subtasks usa apenas:

- Period
- Streaks
- Milestones
- History

Não deve existir uma seção vazia de detalhes do tipo.

## 7. Tarefa de quantidade

`Finished` representa quantas vezes a meta da ocorrência foi atingida. A quantidade realizada é apresentada separadamente.

```text
COUNT — período selecionado

Current progress     7 / 10 pages
Amount completed       184 pages
Daily average          8.4 pages
Best day                26 pages
Best day date      18 Aug 2026
Target reached          15 times
```

- Current progress aparece quando o período inclui hoje.
- Amount completed soma os valores registrados no período.
- Daily average usa os dias programados avaliados no período.
- Best day é o maior valor diário, não o maior incremento individual.
- Target reached deve ser coerente com Finished.

## 8. Tarefa de tempo

```text
TIME — período selecionado

Current progress        25m / 30m
Time completed           7h 30m
Daily average                24m
Best day                  1h 20m
Best day date         18 Aug 2026
Target reached           12 times
```

O modelo atual guarda o total por dia, não sessões individuais. Por isso a métrica correta é **Best day**, e não **Longest session**.

## 9. Tarefa com subtasks

### Resumo da tarefa

```text
SUBTASK SUMMARY

Fully finished       28
Total checks          97
Average per day      2.4 / 3
Perfect days          28
```

- **Fully finished:** ocorrências em que a tarefa inteira foi concluída.
- **Total checks:** soma de todas as subtasks marcadas no período.
- **Average per day:** média de subtasks concluídas por ocorrência avaliada.
- **Perfect days:** dias em que todas as subtasks foram concluídas.

### Estatísticas individuais

Cada subtask recebe seu próprio bloco:

```text
Alongamento

Finished              16
Scheduled             20
Missed                 4
Success rate         80%
Current streak         4
Best streak           12
Last finished       Today
```

- Finished, Scheduled, Missed e Success rate obedecem ao seletor de período.
- Current streak, Best streak e Last finished são gerais.
- A conclusão de uma subtask altera somente as estatísticas daquela subtask.
- O streak geral da tarefa continua dependendo da conclusão da tarefa inteira.

Quando houver muitas subtasks, cada bloco pode ser recolhível. A linha fechada mostra pelo menos nome e Finished; ao tocar, todos os números são revelados.

## 10. Tarefa única

Streak e médias recorrentes não aparecem.

```text
ONE-TIME TASK

Finished             Yes
Scheduled date       10 Aug 2026
Finished date        12 Aug 2026
Days to finish        2
```

Se ainda estiver aberta, mostrar `Finished: No` e `Days pending`.

## 11. Reminder

O reminder atual não registra confirmação de leitura ou conclusão. Portanto, não devem ser inventados streak, Finished ou Success rate.

```text
REMINDER

Past occurrences      12
Next occurrence     Tomorrow
Active for            30 days
Remaining occurrences  8
```

Remaining occurrences só aparece quando existe data final. O app não deve chamar uma notificação de “vista”, “cumprida” ou “perdida” sem possuir esse evento armazenado.

## 12. Requisitos de dados antes da implementação

Para que os números sejam confiáveis, a implementação futura deve resolver:

1. **Data de criação da subtask:** necessária para não penalizar uma subtask pelos dias anteriores à sua existência.
2. **Histórico de agenda:** editar repetição no futuro não deve reinterpretar incorretamente ocorrências antigas.
3. **Limite do timer:** o dado atual permite estatística diária, mas não estatística por sessão.
4. **Reminder:** métricas de leitura ou ação exigiriam um novo evento explícito; não podem ser inferidas da entrega da notificação.
5. **Fuso e virada do dia:** períodos e streaks devem usar as mesmas regras locais do restante do app.
6. **Arquivamento e restauração:** números históricos permanecem disponíveis e não podem depender de um contador paralelo divergente de `completedDates`/`progressByDate`.

## 13. Escopo do Open task após Troféus

O Open task permanece voltado a operação e controle:

- título, imagem e horário;
- repetição e datas;
- progresso da ocorrência atual;
- marcar/desmarcar conclusão;
- controlar subtasks;
- ajustar quantidade ou tempo;
- estado de bloqueio/arquivamento quando aplicável;
- botão `Edit task` no final.

Ele não deve duplicar a ficha analítica completa. Troféus será a fonte principal para históricos, recordes, períodos, comparações e conquistas.

## 14. Fora de escopo nesta etapa

- Implementar a tela ou alterar a navegação.
- Mover agora os números existentes do Open task.
- Criar gráficos.
- Registrar sessões individuais de timer.
- Criar confirmação de leitura de reminders.
- Definir o nome final ou o ícone da área.

