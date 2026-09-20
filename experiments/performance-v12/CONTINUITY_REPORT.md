# Continuidade: performance-v12

Atualizado em 2026-09-20. Branch: experiment/performance-v12.
Worktree: C:/Users/Rider V/Downloads/G-FShield/.worktrees/performance-v12.
Base: 92c7ec0. Remoto: https://github.com/NicNaves/G-FShield.git.
Commit das otimizacoes e testes Weka: 47fb14c.

## Progresso confirmado

- Corrigida a consulta de PID do lock no Windows: OpenProcess/WaitForSingleObject,
  sem os.kill(pid, 0). A chamada antiga podia emitir CTRL_C_EVENT e fechar Codex.
  Commit da correcao: 7c70130. Teste de regressao aprovado sem enviar sinais.
- Memoizacao exata e opcional, limitada atomicamente, com espera por avaliacao
  concorrente identica, copia defensiva e remocao de falhas.
- Chave inclui identidade de execucao, conteudo dos dados, parametros efetivos
  do classificador e subconjunto. Identificador de telemetria SHA-256.
- Busca de substituicao paralela opcional com classificador independente,
  desempate em ordem e tratamento de cancelamento. Coletores encerrados em finally.
- Telemetria separa trained, memoized e unclassified; resultados registram flags.
- Runner v12 separado preserva o arquivo/execucao v11 e verifica recursos,
  hashes, imagens, piloto e teto temporal. Protocolo: 99 celulas formais.
- Testes Weka reais em dados sinteticos verificaram resultados exatamente iguais
  nas quatro combinacoes locais (paralelismo 1/3 x memoizacao desligada/ligada).
  Isso comprova esses casos de regressao, nao ganho de desempenho em IDS.

## Ambiente de validacao local

JDK portatil Temurin 17.0.20.1+1, obtido da API oficial Adoptium e verificado.
SHA-256 do ZIP: e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0.
JAVA_HOME temporario: C:/Users/Rider V/AppData/Local/Temp/gfshield-v12-jdk17/jdk-17.0.20.1+1.
Nao alterado o Java global do usuario. Maven wrapper do proprio modulo.
Relatorios Java: target/surefire-reports do modulo IWSSR: 13 testes aprovados,
zero falhas/erros/skips, incluindo IDs SHA-256 e todos os ajustes finais Java.
Suite Python: 72 testes aprovados (incluindo gates do protocolo e Compose).
`git diff --check` aprovado; o `--help` do runner v12 foi executado.

## Servidor: ultima consulta efetiva

2026-09-20 aproximadamente 07:25 UTC: v11 RUNNING, 52/100 concluidas,
13 por braco, zero tentativas invalidas. Semente 115 em execucao.
Estado: /home/idscps/nicolas/experiment-artifacts/pipeline-ablation/formal-v11/state.json.
Acesso SSH autorizado: idscps@200.156.91.194, porta 2289.
Credenciais nao registradas neste arquivo.

Nenhum build ou piloto v12 foi iniciado no servidor para evitar competicao com
a v11. Nenhuma imagem, processo ou arquivo da campanha v11 foi alterado.

## Proximos marcos

1. Confirmar a publicacao dos commits em origin/experiment/performance-v12
   com git log e git ls-remote antes de criar o checkout do servidor.
2. Quando v11 concluir, criar checkout dedicado v12 no servidor; usar tags novas.
3. Build, auditoria do Compose e piloto de nove bracos com semente 127.
4. Auditar equivalencia/flags/telemetria, completude de artefatos, limites reais,
   fila, overhead e cancelamento. Repetir piloto se houver mudanca no codigo.
5. Implementar analise fatorial v12 e completar instrumentacao pendente antes
   das conclusoes estatisticas. Nao reutilizar conclusoes automaticas do v11.
6. Campanha formal de 99 celulas (sementes 128-138), limite global 10 dias.
7. Atualizar PT/EN somente com evidencias observadas, inclusive perdas e limites.

Ver README.md e protocol.json para comandos, fatores, metricas e limitacoes.
Ainda nao existem resultados experimentais v12 para afirmar superioridade.
