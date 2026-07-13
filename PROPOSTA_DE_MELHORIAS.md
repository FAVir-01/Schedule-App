# Proposta de melhorias do Favit

**Status:** proposta aprovada, com implementação iniciada

**Data da análise:** 13 de julho de 2026

**Escopo:** estabilidade, limpeza, experiência do usuário, arquitetura e evolução do produto

**Natureza do documento:** plano de mudanças e registro de execução

### Registro de execução

- **13 de julho de 2026 — Sessão 1 concluída:** B01, B03, B08 e B12 implementados.
- **13 de julho de 2026 — Sessão 2 concluída:** B05, B06 e B07 implementados; validação final em aparelhos Android e iOS ainda necessária.
- **13 de julho de 2026 — Sessão 3 concluída:** primeira fase de B09 e a exportação de N01 implementadas; importação/restauração e incorporação de mídia continuam pendentes.
- **13 de julho de 2026 — B17 configurado:** identidade Android fixada em `com.favit`, versões locais alinhadas e assinatura de debug removida do release; credencial, versão remota e artefato EAS ainda precisam de validação externa antes de publicar.
- **Próximo bloco recomendado:** B10 e B11 acompanhados dos primeiros testes de T04 para quantum, datas e recorrência.

## 1. Objetivo

Este documento consolida a análise técnica e de produto do aplicativo Favit em sua fase atual. O objetivo é orientar melhorias graduais, priorizadas e de baixo risco, sem recomendar uma reescrita completa.

A análise foi feita por leitura do código, das configurações, do histórico Git e do arquivo de diagnóstico disponível. O projeto analisado é um aplicativo React Native/Expo local. Não existe backend, API ou banco de dados remoto neste repositório; os dados são mantidos em `AsyncStorage` e arquivos locais.

## 2. Resumo executivo

Principais conclusões:

- Há bugs confirmados nos dados do perfil, no ciclo de vida dos lembretes, na virada do dia, no relatório diário e em operações envolvendo tarefas bloqueadas.
- O travamento específico dos gráficos ainda não foi confirmado por log. Entretanto, há duas causas técnicas fortes: cálculos síncronos proporcionais a todo o histórico e captura indevida dos gestos do `ScrollView` pelo gráfico.
- Existe risco crítico de sobrescrita de dados quando o JSON armazenado é válido, mas possui estrutura inesperada.
- As identidades Android configuradas no Expo e no projeto nativo são diferentes.
- A base não possui testes automatizados, lint configurado, verificação de tipos ou tratamento global de erros.
- A arquitetura ainda atende a um MVP, mas os dois arquivos principais já chegaram a um tamanho que aumenta significativamente o risco de regressões.
- Não foram encontradas evidências de backend, endpoints, tabelas remotas, variáveis `.env` ou massa mockada no fluxo principal.

### 2.1 Classificação dos achados

- **Confirmado:** comportamento demonstrável diretamente pelo código.
- **Risco:** há evidência técnica, mas o impacto depende de volume, dispositivo ou estado externo.
- **Validar:** precisa ser reproduzido no aplicativo compilado.
- **Risco**, nas tabelas, representa o dano provável caso o item não seja tratado.

## 3. Diagnóstico específico do perfil e dos gráficos

Foram encontradas três evidências relevantes:

1. O número de conclusões de um hábito filtrado tende a aparecer como zero, pois `completedDates` é um objeto, mas o perfil consulta sua propriedade `length` em [App.js](./App.js#L881).
2. As estatísticas percorrem todos os dias desde o registro mais antigo e, para cada dia, filtram todas as tarefas em [App.js](./App.js#L852). Isso pode bloquear a thread da interface com histórico longo ou datas corrompidas.
3. O gráfico captura qualquer toque imediatamente e não permite que o `ScrollView` assuma o gesto em [PerformanceChart.js](./components/PerformanceChart.js#L303). Arrastar verticalmente começando sobre o gráfico pode parecer um travamento.

O arquivo `bugreport-sdk_gphone16k_x86_64-CP21.260330.005-2026-07-09-19-27-27.zip` não confirma um crash do perfil:

- O bugreport é de 9 de julho, enquanto o gráfico atual foi introduzido e reformulado em 12 de julho.
- Os quatro ANRs encontrados pertencem a processos Android, não ao Favit.
- Não foram encontrados `FATAL EXCEPTION`, `ReferenceError`, `TypeError`, `OutOfMemoryError` ou `ANR in com.favit`.
- O sistema matou `com.favit` como processo em cache durante pressão global de memória, com aproximadamente 157 MB de RSS. Isso justifica uma investigação de memória, mas não prova que o gráfico causou o encerramento.

## 4. Bugs, travamentos e problemas de funcionamento

| ID | Descrição, evidência e áreas | Impacto e risco | Esforço / prioridade | Recomendação e dependências |
|---|---|---|---|---|
| B01 — Implementado na Sessão 1 | **Conclusões do hábito filtrado sempre zeradas.** `completedDates` é normalizado como mapa por data, mas o perfil usava `.length` em [App.js](./App.js#L904). | Estatísticas incorretas e perda de confiança nos gráficos. Risco funcional alto. | Pequeno / **Alta** | Implementado: contar somente chaves com valor `true`. Ainda deve receber teste para dados antigos e atuais. Depende de T04. |
| B02 — Risco forte | **Cálculo do perfil pode bloquear a interface.** `eachDayOfInterval` não possui limite e cada dia filtra todas as tarefas em [App.js](./App.js#L895). O gráfico limita o período a 730 dias, mas ainda faz buscas repetidas em [PerformanceChart.js](./components/PerformanceChart.js#L145). | Travadas ao abrir o perfil, principalmente com histórico longo, muitas tarefas ou data inválida. | Médio / **Alta** | Validar datas, limitar intervalos, pré-indexar conclusões/agendamentos por data e medir com bases de 50, 500 e 2.000 tarefas. Depende de T03 e T04. |
| B03 — Implementado na Sessão 1; validar em aparelho | **O gráfico bloqueava a rolagem vertical.** O responder aceitava todo toque e rejeitava a transferência do gesto para o pai em [PerformanceChart.js](./components/PerformanceChart.js#L303). | O usuário tentava rolar o perfil sobre o gráfico e a tela parecia congelada. | Pequeno–médio / **Alta** | Implementado: o gráfico só assume movimento predominantemente horizontal e permite a transferência do gesto. Falta validar em Android e iOS. |
| B04 — Validar | **O travamento atual do perfil não possui diagnóstico reproduzível.** O bugreport antecede os gráficos atuais e não contém crash do app. | Corrigir uma causa presumida pode esconder o problema real. | Médio / **Alta** | Criar cenário controlado com medição de JS FPS, UI FPS, duração dos cálculos e memória; testar gráfico de linha, barras, filtros e rolagem com datasets progressivos. Depende de T04 e T06. |
| B05 — Implementado na Sessão 2; validar em aparelho | **Lembretes recorrentes eram agendados somente uma vez.** [reminderService.js](./services/reminderService.js) agora usa recorrência nativa para padrões simples, mantém uma fila para intervalos/data final e reconcilia IDs pendentes na hidratação, após uma notificação recebida e no retorno ao app em [App.js](./App.js). | Evita que os lembretes parem silenciosamente após o primeiro disparo. Risco residual de comportamento específico de fabricante/plataforma. | Médio / **Alta** | Implementado com migração compatível do `notificationId` legado para `notificationIds`. Validar disparos repetidos, mudança de fuso/horário de verão e limites nativos em Android e iOS. Depende de T03/T04. |
| B06 — Implementado na Sessão 2; validar em aparelho | **Exclusões deixavam notificações órfãs ou cancelavam lembretes de tarefas bloqueadas.** Exclusões pelo card e perfil agora cancelam todos os IDs associados; a seleção em massa filtra bloqueadas antes do cancelamento. A reconciliação também remove agendamentos órfãos identificados pelo ID da tarefa. | Impede notificações de tarefas apagadas e preserva lembretes de tarefas bloqueadas. | Pequeno–médio / **Alta** | Implementado em [App.js](./App.js) e [reminderService.js](./services/reminderService.js). Validar exclusão normal, em massa, bloqueada e exclusão logo após criar/editar. |
| B07 — Implementado na Sessão 2; validar em aparelho | **O formulário aceitava lembrete sem horário e solicitava permissão ao abrir o painel.** [AddHabitSheet.js](./components/AddHabitSheet.js) agora exige horário, pede permissão apenas ao aplicar a opção e apresenta feedback localizado para negação, indisponibilidade e falha de agendamento. | Reduz configurações que parecem ativas mas nunca notificam e deixa a solicitação de permissão contextual. | Médio / **Alta** | Implementado com tratamento explícito de erros. Validar permissão concedida, negada, revogada e reativada nas configurações do sistema. Depende de U04/T04. |
| B08 — Implementado na Sessão 1 | **O aplicativo não acompanhava a virada do dia.** `today` era calculado uma vez com `useMemo([])` em [App.js](./App.js#L378). | Após passar da meia-noite ou voltar do background, a tela podia mostrar e registrar no dia errado. | Pequeno / **Alta** | Implementado: derivar o dia do relógio atualizado, sincronizar ao retornar ao app e avançar `selectedDate` somente quando o usuário estava em “hoje”. |
| B09 — Primeira fase implementada na Sessão 3; validar em aparelho | **JSON válido com formato errado podia provocar sobrescrita de dados.** [storage.js](./storage.js) agora valida a estrutura de nível superior de cada store, preserva o valor bruto inválido e sinaliza falha. [App.js](./App.js) inicia em modo protegido, bloqueia as escritas da store que falhou — incluindo imagens mensais e `moodAppearance` — e avisa o usuário. | Reduz o risco imediato de substituir dados locais válidos por estados vazios e oferece material bruto para recuperação. Ainda não há validação campo a campo nem feedback de falha de escrita. | Médio / **Crítica** | Implementado no escopo simplificado aprovado. Validar dados malformados e falhas reais de leitura em Android/iOS. Depois, adicionar esquema versionado mais profundo, retorno explícito das escritas e a importação/restauração de N01. |
| B10 — Confirmado | **Tarefas quantum inválidas e progresso inconsistente.** O formulário valida apenas título e aceita timer `0:00` ou contador zero em [AddHabitSheet.js](./components/AddHabitSheet.js#L1162). Ao alterar tipo, modo ou meta, `completedDates` e `progressByDate` antigos permanecem em [App.js](./App.js#L1941). | Tarefa impossível de progredir ou marcada como concluída com uma meta que já mudou. | Médio / **Alta** | Validar meta positiva e definir política explícita para recalcular, preservar ou reiniciar progresso durante a edição. Depende de T03/T04. |
| B11 — Confirmado | **Repetição permite data final anterior ao início.** O seletor de fim usa “hoje” como mínimo, não a data inicial, em [AddHabitSheet.js](./components/AddHabitSheet.js#L2924). A regra sempre mostra a tarefa no dia inicial antes de verificar o fim em [dateUtils.js](./utils/dateUtils.js#L121). Datas como `2026-02-31` também são normalizadas pelo JavaScript. | Configurações contraditórias e tarefas que aparecem uma única vez sem explicação. | Pequeno–médio / **Média** | Validar calendário real, garantir `endDate >= startDate` e aplicar a regra de término antes do caso especial do início. |
| B12 — Implementado na Sessão 1 | **Relatório com apenas lembretes ficava vazio.** O total excluía lembretes e também controlava a renderização da lista em [DayReportModal.js](./components/DayReportModal.js#L49). | Um dia com lembretes mostrava “sem hábitos” e ocultava os próprios lembretes. | Pequeno / **Média** | Implementado: manter lembretes fora da taxa de sucesso, mas exibi-los com resumo e título próprios. |
| B13 — Confirmado + risco responsivo | **Recuperação incompleta do calendário.** `onScrollToIndexFailed` espera 500 ms e não repete a rolagem em [App.js](./App.js#L2499). O tamanho de célula é calculado uma vez por `Dimensions` em [layout.js](./constants/layout.js#L1). A faixa semanal continua ancorada em “hoje”, mesmo quando outra data é selecionada. | Calendário pode abrir na posição errada e desalinha em tablet, split view ou mudança de tamanho; a data selecionada pode não aparecer na faixa semanal. | Médio / **Média** | Implementar retry real, calcular layout pela largura atual e recentralizar a faixa no dia selecionado. Testar tablets e font scaling. |
| B14 — Confirmado como falha de tratamento | **Persistência de fotos pode falhar fora do `try/catch`.** O picker captura seus erros, mas `copyAsync` é aguardado depois, sem tratamento, em [ReflectionSheet.js](./components/ReflectionSheet.js#L27). Não há limite de dimensão ou tamanho; o seletor de hábitos usa qualidade máxima em [AddHabitSheet.js](./components/AddHabitSheet.js#L635). | Rejeição não tratada, ausência de feedback, consumo excessivo de disco e memória. | Médio / **Alta** | Validar bytes e dimensões, redimensionar quando aplicável, tratar cópia e excluir arquivo parcial. Preservar GIF somente quando necessário. |
| B15 — Confirmado | **Histórico e seleção podem ficar inconsistentes.** O histórico é limitado a 200 eventos em [App.js](./App.js#L532); eventos de conclusão não guardam título, então tarefas excluídas aparecem como desconhecidas em [ActivityTimelineModal.js](./components/ActivityTimelineModal.js#L42). A seleção em massa não remove IDs que desapareceram da lista. | Relatórios históricos perdem contexto; barra de seleção pode mostrar itens inexistentes. | Pequeno–médio / **Média** | Guardar snapshot mínimo do título, podar IDs selecionados quando `tasks` mudar e separar histórico analítico do histórico recente de interface. |
| B16 — Confirmado, baixo impacto | **Celebração pode disparar na hidratação.** `previousCompletionRef` é escrito, mas nunca consultado em [App.js](./App.js#L815). O som vem de uma URL externa em [feedbackUtils.js](./utils/feedbackUtils.js#L59), e os helpers hápticos não capturam rejeições assíncronas. | Confete ou som ao simplesmente abrir o app, falhas offline e requisição de terceiros. | Pequeno / **Baixa–média** | Disparar somente na transição causada pelo usuário, empacotar o áudio localmente e respeitar preferência de som e redução de movimento. |
| B17 — Configuração implementada; validação externa obrigatória | **A identidade Android foi fixada em `com.favit`.** [app.json](./app.json), namespace, `applicationId` e pacotes Kotlin agora concordam. O Gradle usa versão `1.0.0`/código 2, o EAS declara versão remota, incremento automático, AAB e credenciais remotas, e o release não referencia mais `signingConfigs.debug`. [check-android-config.js](./scripts/check-android-config.js) protege essas invariantes. O bugreport confirma `com.favit`, versão 1, instalado no emulador. | Elimina a criação acidental de outro aplicativo Android e impede um release local aparentemente válido assinado com a chave de debug. A continuidade da chave e do código remoto ainda depende do EAS/Google Play. | Pequeno–médio / **Crítica antes de publicar** | Executar o checklist de [README.md](./README.md): confirmar que a credencial remota pertence a `com.favit`, reutilizar a upload key se já houver publicação, sincronizar o maior `versionCode`, gerar AAB limpo e inspecionar pacote, assinatura, versão, runtime e canal. A instalação antiga foi assinada com debug e não aceitará por cima uma chave de produção diferente; preservar dados antes de removê-la. |

## 5. Código antigo, lixo e partes possivelmente não utilizadas

| ID | Evidência e áreas | Impacto e risco | Esforço / prioridade | Verificação antes de remover |
|---|---|---|---|---|
| L01 | [WheelPicker.js](./components/WheelPicker.js) não é importado pelo código atual. O formulário possui outra implementação interna. Há cerca de 30 estilos `quantumModal*` e `timerWheel*` sem referência em [appStyles.js](./styles/appStyles.js#L547). O histórico mostra que o modal quantum antigo foi removido. | Ruído e manutenção confusa. Risco baixo de remoção se não houver entrada dinâmica. | Pequeno / **Média** | Confirmar no bundle e no histórico que nenhum fluxo experimental ainda depende deles; cobrir quantum com testes antes de excluir. |
| L02 | Símbolos encontrados apenas na própria declaração ou exportação: `DEFAULT_TAG_OPTIONS` em [AddHabitSheet.js](./components/AddHabitSheet.js#L182), `LEFT_TABS`/`RIGHT_TABS` em [navigation.js](./constants/navigation.js), `MONTH_NAMES`, `calculateWeeksInMonth` e `interpolateHexColor`. | API interna maior que o necessário e risco de confundir novas implementações. | Pequeno / **Baixa** | Rodar lint/analisador de imports e confirmar que não há consumo externo ou geração dinâmica. |
| L03 | Funções de cor, calendário, data, horário e wheel são parcialmente duplicadas entre `AddHabitSheet`, `App.js` e `utils`. | Correções podem ser aplicadas em uma versão e esquecidas na outra. | Médio / **Média** | Criar testes de equivalência antes de consolidar. Não unificar helpers que possuam semânticas diferentes apenas pelo nome. |
| L04 | `expo-constants` não possui importação direta; `snack-icon.png` não possui referência. `favicon.png` pode depender do alvo web por convenção. Veja [package.json](./package.json) e [assets](./assets). | Dependência ou asset potencialmente desnecessário; risco de quebrar Expo, EAS ou web se removido por busca textual apenas. | Pequeno / **Baixa** | Usar `expo-doctor`, análise do bundle e builds Android, iOS e web antes de alterar dependências ou assets. |
| L05 | Existem migrações embutidas para `type: list`, campos `completed`, progresso quantum antigo, URIs de cache e humor legado. `CUSTOM_MOOD_IMAGES` é mantida somente para reset em [storage.js](./storage.js#L3). | Mantém complexidade, mas remover cedo pode impedir usuários antigos de atualizar. | Médio / **Baixa agora** | Criar versão de esquema, migrar de forma idempotente, registrar versão concluída e manter compatibilidade por pelo menos um ciclo de atualização. |
| L06 | `.expo/README.md` está versionado. Há arquivos não rastreados de diagnóstico e design na raiz, incluindo bugreport, imagens de WhatsApp, `preview.webp` e `.claude/`. | Poluição do workspace e risco de publicar arquivos grandes ou pessoais. | Pequeno / **Média** | Confirmar propriedade e utilidade; depois decidir o que deve ser arquivado fora do repositório e o que deve entrar no `.gitignore`. |
| L07 | `previousCompletionRef` não é lido, e `onScrollToIndexFailed` possui uma promessa sem ação. | O código dá a impressão de que uma proteção ou retry existe quando não existe. | Pequeno / **Média** | Transformar em lógica real ou remover somente depois dos testes de celebração e calendário. |

### 5.1 Elementos que não foram encontrados

- Backend, endpoints, tabelas remotas ou variáveis `.env`.
- Massa mockada usada no fluxo principal.
- Grandes blocos de JavaScript antigo comentado.
- Evidência suficiente para classificar `expo-dev-client` ou `expo-updates` como não utilizados; ambos participam do processo de build ou OTA.

## 6. Melhorias de UX e experiência do usuário

| ID | Descrição e evidência | Impacto e risco | Esforço / prioridade | Recomendação e dependências |
|---|---|---|---|---|
| U01 | **Primeira experiência sem onboarding.** Não há estado de primeiro uso. A aba Descubra é apenas um placeholder em [App.js](./App.js#L2723). | O usuário não entende tipos de tarefa, quantum, reflexão, calendário ou propósito do produto. | Médio / **Alta** | Onboarding curto com criação assistida da primeira rotina e possibilidade de pular. Usar Descubra para templates reais. Depende de B09. |
| U02 | **Gestos importantes são escondidos:** deslizar para copiar ou excluir, segurar quantum, segurar humor para personalizar e segurar tarefa para seleção em massa. | Baixa descoberta; usuários podem nunca encontrar recursos importantes. | Pequeno–médio / **Alta** | Dicas contextuais no primeiro uso, menus visíveis alternativos e ações acessíveis sem gesto. |
| U03 | **Ações destrutivas sem confirmação ou desfazer.** Exclusão de tarefa, exclusão em massa e remoção de reflexão são imediatas. | Perda acidental de conteúdo, agravada pela falta de backup. | Médio / **Alta** | Preferir “Desfazer” temporário; confirmar exclusão em massa e conteúdos com nota ou foto. Depende de B09/N01. |
| U04 | **Feedback incompleto.** Salvamentos locais e agendamentos não exibem sucesso ou erro; seleção de imagem usa console em vários fluxos. | O usuário não sabe se a ação funcionou. | Médio / **Alta** | Padronizar estados de carregamento, sucesso, vazio, erro e retry. Não fechar formulário quando a persistência crítica falhar. |
| U05 | **Internacionalização inconsistente.** Perfil e detalhes possuem textos fixos em inglês e “Cont” em [ProfileTaskDetailModal.js](./components/ProfileTaskDetailModal.js#L32); filtros e exclusão ficam em inglês em [ProfileTasksModal.js](./components/ProfileTasksModal.js#L67). Notificações são sempre em português. `tagLabel` e `typeLabel` são persistidos já traduzidos. | Interface parcialmente em outro idioma após trocar idioma; dados antigos preservam rótulos anteriores. | Médio / **Alta** | Persistir somente chaves semânticas e traduzir na renderização. Centralizar todos os textos e labels de acessibilidade. |
| U06 | **Acessibilidade insuficiente em gráfico e calendário.** Nenhum deles possui labels ou estado acessível. Há controles de gráfico apenas por ícone; animações, GIFs e confete não consideram redução de movimento. | Barreiras para leitor de tela, controle por teclado e pessoas sensíveis a movimento. | Médio–grande / **Alta** | Adicionar resumo textual do gráfico, labels e estado selecionado, alternativa às ações por gesto e respeito a Reduce Motion. Validar contraste e fonte em 200%. |
| U07 | **Semântica do gráfico pouco clara.** O cabeçalho usa taxa real do período, a linha usa média móvel e as barras usam taxa do intervalo. O modo acumulado e “valores” podem mostrar o mesmo total no cabeçalho. | O usuário interpreta tendências diferentes como se fossem a mesma métrica. | Pequeno–médio / **Média** | Nomear claramente “taxa do período”, “média móvel de 7 dias” e “total acumulado”; incluir ajuda curta e estados vazios específicos. |
| U08 | **Navegação temporal confusa.** A faixa semanal fica centrada em hoje; editar ou criar tarefa para outra data muda `selectedDate`, mas a data pode ficar fora da faixa. O calendário abre relatório, não seleciona a data na aba Hoje. | O usuário não entende em qual dia está operando ou como voltar. | Médio / **Média** | Definir modelo único: selecionar uma data deve recentralizar a semana; oferecer “Voltar para hoje”; diferenciar “abrir relatório” de “editar o dia”. |
| U09 | **Escalabilidade visual limitada.** A aba Hoje usa `ScrollView` com todos os cards e o perfil renderiza todos os chips de tarefa em um `map` em [App.js](./App.js#L2287). | Muitas tarefas deixam rolagem e filtros lentos e difíceis de navegar. | Médio / **Média** | Virtualizar listas, oferecer busca e filtros e limitar chips recentes ou favoritos. Depende de T05. |
| U10 | **Configurações mínimas e pouca transparência sobre os dados.** A tela contém apenas idioma e imagens do calendário em [SettingsSheet.js](./components/SettingsSheet.js#L26). | O usuário não sabe que os dados são locais nem como recuperá-los, protegê-los ou transferi-los. | Médio / **Alta** | Adicionar exportação e importação, privacidade de notificações, som e háptico, redução de movimento e explicação sobre armazenamento local. |

## 7. Melhorias técnicas e arquiteturais

| ID | Descrição e evidência | Impacto e risco | Esforço / prioridade | Recomendação e dependências |
|---|---|---|---|---|
| T01 | **Componentes monolíticos.** [App.js](./App.js#L254) possui cerca de 3.100 linhas; [AddHabitSheet.js](./components/AddHabitSheet.js) possui cerca de 4.300. Estado, persistência, notificações, domínio e UI estão misturados. | Alta chance de regressão e dificuldade de teste. | Grande, gradual / **Alta** | Extrair por domínio: tarefas, calendário, perfil, reflexões, notificações e persistência. Não reescrever telas inteiras; mover funções puras primeiro. |
| T02 — Primeira fase implementada na Sessão 3 | **Persistência ainda não tem esquema campo a campo nem retorno de erro, mas passou a validar o formato de nível superior.** Stores inválidas são preservadas e entram em modo protegido contra escrita. | Remove o caminho confirmado de sobrescrita após falha de leitura; erros de gravação e incompatibilidades internas ainda precisam de tratamento. | Pequeno–médio entregue; restante médio / **Alta** | Validar a proteção em aparelhos e evoluir gradualmente para schema versionado e retorno explícito de escrita. Transações e snapshots só devem ser avaliados se a complexidade futura justificar. |
| T03 | **Lógica de domínio espalhada.** Recorrência, progresso, lembrete, exclusão e analytics são calculados em vários componentes. | Regras divergentes entre perfil, calendário e Hoje. | Médio–grande / **Alta** | Serviços ou funções puras para agenda, conclusão, quantum e lembretes; usar os mesmos resultados em todas as telas. |
| T04 | **Ausência completa de testes e checks.** Não há arquivos de teste; [package.json](./package.json#L21) não possui scripts de teste, lint ou typecheck. | Bugs simples, como `.length` em objeto, chegam ao fluxo principal. | Pequeno inicialmente / **Alta** | Começar com uma suíte mínima para data, recorrência, quantum, perfil e persistência. Expandir somente ao corrigir bugs ou alterar regras críticas. |
| T05 | **Trabalho pesado na thread de UI.** Perfil e calendário varrem listas repetidamente; Hoje monta todos os cards; GIFs de calendário chegam a 385 frames e dimensões de 1024 px, por exemplo [feb.gif](./assets/months/feb.gif). | Queda de FPS e memória em aparelhos modestos. | Médio–grande / **Alta** | Pré-indexar dados, virtualizar listas, limitar caches, medir imagens e gerar assets apropriados por uso. |
| T06 | **Sem Error Boundary ou observabilidade estruturada.** Erros são enviados ao console e não há contexto de tela, ação, memória ou dataset. | Travamentos reais ficam difíceis de reproduzir. | Médio / **Alta** | Error Boundary com tela recuperável, logs sanitizados, métricas de duração e crash reporting opt-in. Não registrar notas, títulos ou fotos sensíveis. |
| T07 | **Segurança e privacidade.** Notas e fotos não têm proteção adicional da aplicação; notificações expõem títulos; o áudio de conclusão acessa terceiro. O manifest inclui `SYSTEM_ALERT_WINDOW` e permissões de armazenamento antigas em [AndroidManifest.xml](./android/app/src/main/AndroidManifest.xml#L2). | Exposição de informações pessoais e risco de revisão negativa em loja. | Médio–grande / **Alta** | Remover permissões não necessárias, oferecer conteúdo privado em notificações, app lock opcional e política clara de dados. |
| T08 | **Navegação manual por estado.** Não há pilha, deep link ou restauração formal de rotas. | Voltar do Android, modais aninhados e links futuros ficam difíceis de manter. | Médio / **Média** | Adotar navegação estruturada gradualmente quando surgirem onboarding, relatórios e configurações; preservar estado de cada aba. |
| T09 | **Declarações usadas antes de serem definidas.** Dependências de hooks referenciam `cancelTaskReminder`, `updateUserSettings`, `refreshTaskReminder` e outras antes da declaração em [App.js](./App.js#L552); `typeOptions` ocorre depois de `handleSubmit` em [AddHabitSheet.js](./components/AddHabitSheet.js#L1162). | O preset atual provavelmente converte escopo de bloco e mascara o problema; mudança no build pode produzir `ReferenceError` ou dependências `undefined`. | Pequeno / **Média** | Ordenar declarações por dependência e adicionar regra de lint. Confirmar o bundle release atual antes de classificar como crash. |
| T10 | **Dependências sem auditoria automatizada.** Não foi possível executar `expo-doctor`, auditoria de vulnerabilidades ou build porque `node` não estava disponível no ambiente da análise. | Compatibilidade e vulnerabilidades atuais não foram validadas. | Pequeno / **Média** | Incluir `expo-doctor`, auditoria de dependências e build limpo no CI; avaliar resultados sem atualizar pacotes em massa. |
| T11 | **Ausência de backend é adequada ao MVP, mas limita evolução.** Não há servidor, conta, sincronização ou banco remoto. | IA em nuvem, social, backup e multi-dispositivo exigirão uma nova fronteira de segurança. | Grande / **Baixa agora** | Manter local-first; introduzir backend somente para uma funcionalidade com valor comprovado, com consentimento e sincronização explícita. |

## 8. Sugestões de novas funcionalidades

As propostas abaixo consideram o que já existe: tarefas, quantum, reflexões com foto, humor, calendário, sequências, confete e gráficos.

| ID | Problema e funcionamento | Evidência e valor | Complexidade e riscos | Momento e dependências |
|---|---|---|---|---|
| N01 — Exportação implementada; importação/restauração pendentes | [backupService.js](./services/backupService.js) gera um JSON versionado com tarefas, reflexões, configurações, humores, aparência, imagens mensais e snapshot bruto de recuperação. O usuário exporta pelas Configurações; Android usa seletor de pasta, iOS usa compartilhamento e web faz download. As URIs de mídia são listadas, mas os arquivos ainda não são incorporados. | Cria a primeira rede de segurança explícita para dados exclusivamente locais e preserva dados brutos quando uma store falha. | Pequena–média entregue; restante médio–grande por causa de mídia, validação, migração e conflitos. | **Exportação entregue na Sessão 3.** Validar em Android/iOS/web. A próxima fase deve importar com prévia, validação de versão e confirmação, sem sobrescrever automaticamente. Depende da evolução de T02. |
| N02 — Templates e onboarding na aba Descubra | Transformar o placeholder em coleções como estudo, saúde, rotina matinal e organização; o usuário visualiza e escolhe o que importar. | Reduz a barreira da primeira tarefa e dá função real à aba existente. | Média; evitar excesso de templates e recomendações genéricas. | **Agora ou depois da estabilização**. Depende de U01. |
| N03 — Metas explícitas e comparação de períodos | Permitir meta semanal ou mensal por hábito e comparação com período anterior. Reutilizar o gráfico, mas separar meta, taxa e volume. | Dá contexto ao progresso, hoje exibido sem objetivo definido. | Média; não punir hábitos não diários. | **Depois**. Depende de B01–B04 e T03. |
| N04 — Lembretes inteligentes | Sugerir horários com base em quando o usuário normalmente conclui, permitindo aceitar, ajustar ou ignorar. | Aumenta utilidade sem elevar a quantidade de notificações. | Média–grande; permissão, transparência, timezone e risco de spam. | **Depois**, somente após B05–B07. |
| N05 — Resumo semanal ou mensal local | Gerar relatório determinístico com conclusões, melhores dias, hábitos abandonados, humor e notas registradas. | Usa dados já existentes sem custo ou exposição à IA. | Média; evitar conclusões causais. | **Depois**, antes de resumo por IA. Depende de T02/T03. |
| N06 — Transcrição por voz | Botão de microfone no relato diário; a gravação vira rascunho editável antes de salvar. | Reduz esforço para registrar o dia em [ReflectionSheet.js](./components/ReflectionSheet.js). | Média–grande; permissão, custo, ruído, idioma e tratamento do áudio. | **Depois**. Preferir processamento no dispositivo quando viável. |
| N07 — OCR de texto manuscrito | O usuário fotografa o papel, escolhe a área e recebe texto editável no campo da reflexão. O texto existente nunca deve ser substituído automaticamente. | Aproveita o fluxo atual de foto e nota. É útil para quem já escreve à mão. | Grande; precisão de caligrafia, LGPD, custo e retenção da imagem. | **Futuro próximo**, após privacidade e backup. |
| N08 — Resumos e padrões com IA | Com consentimento, resumir semana ou mês e apontar correlações como “dias com atividade X tiveram mais conclusões”. Mostrar evidências e permitir contestar. | Pode transformar dados dispersos em aprendizado acionável. | Grande; privacidade, alucinações, inferências de saúde mental e custo. | **Futuro**. Depende de N05, T02, T06 e política de IA. |
| N09 — Linha do tempo pesquisável | Pesquisa por texto, tags, humor e período em reflexões e atividades; filtros como “dias bons”, “com foto” e “com nota”. | Recupera valor do diário acumulado e melhora retenção. | Média; indexação e privacidade. | **Depois**. Depende de histórico durável, não limitado a 200 eventos. |
| N10 — Widget e captura rápida | Widget com progresso do dia e atalhos para concluir tarefa ou registrar reflexão. | Diminui atrito no uso diário sem adicionar notificações. | Grande; Android e iOS nativos e sincronização de estado. | **Futuro**, após estabilização da persistência. |
| N11 — Sincronização opcional entre dispositivos | Conta opcional, dados local-first e sincronização criptografada. O app deve continuar funcionando sem cadastro. | Protege contra troca ou perda de aparelho e prepara recursos sociais. | Grande; conflitos, autenticação, segurança e custo operacional. | **Futuro**. Começar apenas se N01 não atender à necessidade. |

## 9. Ideias experimentais e criativas

| ID | Ideia e valor | Complexidade e cuidados | Momento e dependências |
|---|---|---|---|
| E01 — Ambiente ou planta de progresso | Um elemento visual minimalista evolui com consistência sustentável, não com quantidade bruta de tarefas. Pode mudar semanalmente e nunca “morrer”. | Média; risco de infantilização ou culpa. Deve ser opcional e usar linguagem adulta. | **Futuro experimental**, após metas e acessibilidade. |
| E02 — Estações visuais no calendário | Cores, texturas ou pequenos detalhes mudam conforme ciclos de constância, reflexão e descanso. | Média; respeitar Reduce Motion e não prejudicar legibilidade. | **Futuro**, aproveitando a personalização atual do calendário. |
| E03 — Desafios adaptativos | Desafios opt-in como “registrar três reflexões” ou “cumprir a rotina em quatro dias”, calculados conforme o histórico real. | Média–grande; evitar metas impossíveis, manipulação e excesso de notificações. | **Depois**, com mecanismo de metas confiável. |
| E04 — Sequência resiliente | Em vez de zerar toda motivação por um dia perdido, apresentar retomada, melhor sequência e frequência no período. | Pequena–média; definir regras claras para não parecer que os números mudam arbitrariamente. | **Depois**, como evolução dos streaks existentes. |
| E05 — Revisão visual do mês | Criar uma montagem privada com humores, fotos, frases e marcos, exportável somente sob ação do usuário. | Grande; mídia sensível, tamanho e consentimento de compartilhamento. | **Futuro**, após N01 e controles de privacidade. |
| E06 — Círculos privados opcionais | Compartilhar apenas um objetivo ou conquista escolhida com poucas pessoas, sem feed público. | Grande; exige backend, bloqueio, denúncia, moderação e política de privacidade. | **Somente no futuro**, caso haja demanda comprovada. |
| E07 — Experimentos pessoais | O usuário define uma hipótese, por exemplo “dormir mais cedo melhora minha rotina”, escolhe métricas e recebe comparação simples após algumas semanas. | Grande; não apresentar correlação como causalidade ou aconselhamento médico. | **Futuro experimental**, após analytics confiáveis. |

## 10. Roadmap recomendado

### Sequência prática aprovada

1. **Sessão 1 — concluída:** B01, B08, B03 e B12.
2. **Sessão 2 — concluída:** B05, B06 e B07 — bloco coeso de lembretes.
3. **Sessão 3 — concluída:** primeira fase de B09 e exportação de N01 como rede de segurança.
4. **B17 — configuração concluída:** identidade Android alinhada; validação da credencial e do artefato EAS continua obrigatória antes de qualquer release.

### Etapa 1 — Estabilização

Ordem sugerida:

1. Criar fixtures e proteção de dados antes de modificar persistência.
2. Validar em aparelhos a primeira fase de B09 e a exportação de N01 implementadas na Sessão 3; planejar importação/restauração separadamente.
3. Corrigir lembretes B05–B07.
4. Corrigir o perfil B01–B03 e reproduzir B04.
5. Corrigir virada do dia, quantum, recorrência, relatório e calendário.
6. Validar externamente o pipeline B17 já alinhado: credencial EAS, versão remota, AAB, assinatura e canal.
7. Introduzir testes prioritários de T04 e observabilidade mínima de T06.

Cenários obrigatórios:

- Perfil com 0, 50, 500 e 2.000 tarefas.
- Histórico de dois anos e datas inválidas.
- Rolagem começando dentro do gráfico.
- Permissão de notificação negada.
- Lembrete recorrente após o primeiro disparo.
- Exclusão normal, em massa e com tarefa bloqueada.
- Aplicativo aberto durante a meia-noite.
- JSON válido com formato incorreto.
- Dia contendo somente lembretes.
- Aparelho Android com pouca memória.

**Critério de saída:** nenhuma perda de dados conhecida, lembretes reconciliados, perfil responsivo nos datasets definidos e build release com identidade verificada.

### Etapa 2 — Limpeza

1. Remover apenas após cobertura: `WheelPicker`, estilos antigos e símbolos não referenciados.
2. Consolidar helpers duplicados com testes de equivalência.
3. Criar política de ciclo de vida para migrações legadas.
4. Revisar dependências e assets com bundle analysis.
5. Organizar arquivos de diagnóstico e design e regras de `.gitignore`.
6. Extrair funções puras de `App.js` e `AddHabitSheet.js` gradualmente.

**Critério de saída:** build e testes equivalentes antes e depois de cada remoção, sem alterações funcionais não planejadas.

### Etapa 3 — Experiência do usuário

1. Feedback de salvamento, erro, carregamento e retry.
2. Confirmação ou desfazer para ações destrutivas.
3. Internacionalização completa.
4. Acessibilidade de gráfico, calendário, gestos e animações.
5. Navegação temporal consistente.
6. Onboarding curto e aba Descubra com templates.
7. Configurações de privacidade, som, movimento e dados.
8. Testes em 320 px, tablets, font scale 200%, leitor de tela e Reduce Motion.

### Etapa 4 — Evolução do produto

Prioridade sugerida:

1. N01 — concluir importação/restauração e decidir a estratégia de mídia após validar a exportação.
2. N02 — templates.
3. N03 — metas e comparação.
4. N05 — resumos locais.
5. N09 — histórico pesquisável.
6. N04 — lembretes inteligentes.
7. N10 e N11 somente quando houver justificativa de uso e infraestrutura.

### Etapa 5 — Funcionalidades experimentais

1. Validar primeiro voz e OCR com protótipos editáveis e opt-in.
2. Adicionar IA somente após existir resumo local confiável, consentimento e política de retenção.
3. Testar gamificação em pequenos experimentos, medindo utilidade e não apenas tempo de tela.
4. Manter planta, desafios, círculos e experimentos pessoais opcionais.
5. Evitar qualquer inferência médica, emocional ou causal apresentada como fato.

## 11. Critérios gerais de execução

As futuras implementações devem seguir estes princípios:

- Proteger os dados antes de iniciar migrações ou refatorações.
- Corrigir e medir antes de otimizar por suposição.
- Não remover código legado sem teste e estratégia de compatibilidade.
- Fazer mudanças pequenas, revisáveis e reversíveis.
- Separar claramente correção de bug, refatoração e nova funcionalidade.
- Não adicionar backend ou IA antes de definir consentimento, segurança e valor concreto.
- Manter o funcionamento local e offline como característica central enquanto for compatível com a estratégia do produto.

## 12. Limitações da análise

- Não foi possível executar build, lint, `expo-doctor`, auditoria de dependências ou testes porque `node` não estava disponível no ambiente usado durante a análise.
- Os pontos de performance e responsividade foram analisados estaticamente e precisam de confirmação em aparelhos reais.
- O bugreport disponível não representa a versão atual dos gráficos.
- Como não existe backend ou banco remoto no repositório, consistência entre frontend, backend e banco não pôde ser avaliada.

## 13. Estado do projeto durante a análise

- Nenhum arquivo do aplicativo foi modificado durante a investigação original.
- Nenhum código foi excluído ou refatorado.
- Nenhum commit foi criado.
- Os arquivos não rastreados já presentes no workspace foram apenas identificados e não foram alterados.
