# Continuidade — v14

Preparação em 26/09/2026. Branch: experiment/performance-v14.
Worktree local: C:/Users/Rider V/Downloads/G-FShield/.worktrees/performance-v12.

Implementados: lote paralelo no mesmo JVM, consumo imediato de conclusões,
redução ordenada, prazo estrito e seleção final por snapshot de validação.
Protocolo: quatro braços, 80 execuções formais planejadas, teto global de dez dias.

Validação local inicial: 102 testes, zero falhas; dois testes de integração
J48 aguardam JAR recém-compilado. O servidor será usado para compilação e
validação desses testes antes do piloto.

Formal NÃO iniciada e NÃO programada automaticamente. Piloto ainda não iniciado
neste registro inicial. Não interpretar a preparação como resultado experimental.

Artefatos anteriores v11/v12/v13 preservados. As dissertações ainda não foram
modificadas nesta etapa. Resultados v13: ../performance-v13/ANALISE_RESULTADOS.md.

Próximos passos: compilar e testar J48 real; iniciar piloto técnico isolado;
auditar identidade, prazo, paralelismo e resultados; somente depois liberar
formal. Não escolher braços, sementes ou limiares a partir do holdout.
