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

Formal NÃO iniciada e NÃO programada automaticamente.

Primeiro piloto: iniciado em 2026-09-27T00:26:32.400215+00:00; interrompido
antes do treinamento por FileNotFoundError no primeiro monólito. Causa: symlink
absoluto datasets/campaign não era resolvível dentro do bind mount Docker.
Estado INCOMPLETE, zero células concluídas, retorno 1; tentativa e hashes preservados.
Esse erro de montagem não produziu F1 nem é resultado de desempenho.

Checkout original preservado: /home/idscps/nicolas/G-FShield-performance-v14.
Artefatos originais: /home/idscps/nicolas/experiment-artifacts/performance-v14/pilot.
Código de lançamento original: f3cb3061e31744f56fcbfe45b649539b1d2e8056.
Correção: nova cópia materializada dos mesmos datasets, conferência de hashes,
checkout separado G-FShield-performance-v14-r2 e piloto em pilot-r2.
Nova opção --deadline-state herda o estado anterior, sem renovar os dez dias.
Prazo absoluto preservado: 2026-10-07T00:26:32.400215+00:00.

Imagem monólito validada, mantida sem alteração de runtime:
gfshield-campaign-monolith2:performance-v14-f3cb306
sha256:42a1fcb78f0d35b4d58ceaf73573101cafab389b00cf24997d44e8051da848bd.
Base v13: sha256:440f1c1cf0e62244c64dcec3792145ec8833cbf0eb82d0655f65427cbac1a331.
JAR: b1f001daf389f0237a663423e77751ffb33d8ac0625ecde7640906dbc3775b85.
103 testes no host: um skip de Windows, nenhuma falha; dois testes J48 reais
também aprovados dentro da imagem Docker. Demais cinco imagens reutilizadas
da v13 por ID, sem rebuild; IDs em build-images.json e manifesto congelado.

Artefatos anteriores v11/v12/v13 preservados. As dissertações ainda não foram
modificadas nesta etapa. Resultados v13: ../performance-v13/ANALISE_RESULTADOS.md.

Próximos passos: compilar e testar J48 real; iniciar piloto técnico isolado;
auditar identidade, prazo, paralelismo e resultados; somente depois liberar
formal. Não escolher braços, sementes ou limiares a partir do holdout.
