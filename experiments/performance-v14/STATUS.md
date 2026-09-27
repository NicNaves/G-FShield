# Continuidade — v14

Preparação em 26/09/2026. Branch: experiment/performance-v14.
Worktree local: C:/Users/Rider V/Downloads/G-FShield/.worktrees/performance-v12.

Implementados: lote paralelo no mesmo JVM, consumo imediato de conclusões,
redução ordenada, prazo estrito e seleção final por snapshot de validação.
Protocolo: quatro braços, 80 execuções formais planejadas, teto global de dez dias.

Validação local: 103 testes, zero falhas; dois testes de integração J48 exigem
JAR recém-compilado. No servidor a suite inicial de 102 passou com apenas um
skip de Windows, incluindo J48 real: resultados serial/paralelo iguais,
concorrência >1 e <=3, prazo zero sem avaliação e comando posterior íntegro.
A suite será repetida no commit de lançamento, incluindo o teste adicional.

O build Docker convencional falhou por DNS ao buscar plugin Maven, antes de
criar a imagem. O JAR compilado/testado com Maven no host está disponível.
Fallback: Dockerfile.parallel-prebuilt, sobre a imagem monolith2 da v13;
preservar imagem original, conferir SHA-256 do JAR e registrar ID da base.

Formal NÃO iniciada e NÃO programada automaticamente. Piloto ainda não iniciado
neste registro inicial. Não interpretar a preparação como resultado experimental.

Artefatos anteriores v11/v12/v13 preservados. As dissertações ainda não foram
modificadas nesta etapa. Resultados v13: ../performance-v13/ANALISE_RESULTADOS.md.

Próximos passos: compilar e testar J48 real; iniciar piloto técnico isolado;
auditar identidade, prazo, paralelismo e resultados; somente depois liberar
formal. Não escolher braços, sementes ou limiares a partir do holdout.
