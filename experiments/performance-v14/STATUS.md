# Continuidade — v14

Atualizado em 26/09/2026, aproximadamente 21:33 de Brasília.
Piloto r2 INICIADO e RUNNING; formal continua bloqueada, sem agendamento automático.
Branch: experiment/performance-v14.
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

Próximo passo: concluir e auditar o piloto; somente depois liberar a formal.
Não escolher braços, sementes ou limiares a partir do holdout.

## Estado atual da retomada

As etapas de compilação e testes acima foram concluídas. Dataset materializado
no checkout r2, sem symlink absoluto, e hashes conferidos **dentro do Docker**.
Um diretório vazio criado pelo Docker durante a preparação foi removido e
recriado com o proprietário correto; nenhum dataset ou resultado foi removido.

- Checkout congelado r2: /home/idscps/nicolas/G-FShield-performance-v14-r2.
- Commit de execução: 251ce74ee9abdbdf36326ea443f3b67cc9a7c934 (HEAD destacado).
- Tag de imagens: performance-v14-f3cb306; runtime idêntico ao JAR/imagem já testados.
- Sessão tmux: gfshield-v14-pilot-r2.
- Estado: /home/idscps/nicolas/experiment-artifacts/performance-v14/pilot-r2/state.json.
- Log: /home/idscps/nicolas/experiment-artifacts/performance-v14/pilot-r2-supervisor.log.
- Início: 2026-09-27T00:31:08.510664+00:00 (26/09, 21:31:08 de Brasília).
- Prazo mantido: 2026-10-07T00:26:32.400215+00:00.
- Primeiro contêiner confirmado ativo: gfs10d-optimization-monolith-s199-8fe165b9e7bd.
- Consulta em 2026-09-27T00:34:08Z: 11 avaliações registradas no primeiro monólito;
  confirma treinamento após a correção da montagem, não conclusão da célula.
- SHA-256 manifesto r2: c7b81867d0e5ee99faa96a97a26b78fbbf86b78d0ec42aaf200c6e2cb23668eb.

Evidências de início: diretório local evidence/pilot-r2-start, fora do Git.
Publicação desses logs/configurações foi bloqueada pela revisão automática
de segurança; aguarda escolha do usuário e revisão de dados internos.
Código/protocolo publicados até 251ce74; este estado atualizado fica local
enquanto o escopo de publicação das novas evidências é decidido.
É uma fotografia de início, não estado atualizado em tempo real. Inclui a
tentativa inicial com erro, os dois manifestos, 103 testes do host (um skip,
zero falhas), dois testes de integração na imagem, hashes dos dados e imagens.
O arquivo de transferência foi conferido:
6d250f3ec529ceb0e06687352ea956335cc1da2bea0d0726c7884a1072ebabcf (SHA-256).

O kernel informa ausência de suporte ao limite de swap do contêiner. O limite
de RAM e essa limitação devem ser reportados separadamente; não afirmar que
RAM+swap foi isolada perfeitamente. Os avisos de fallback ARPACK não impediram
os testes J48 reais. Não confundir esses avisos com o erro de dataset já corrigido.

## Próxima sessão

1. Consultar state.json no servidor, logs e contêineres; não inferir sucesso
   apenas pela presença/ausência da sessão tmux.
2. Exigir quatro células completas, hashes válidos, retorno zero, paralelismo
   real no monólito n3 e nenhum contêiner sobrevivente. Não filtrar por F1.
3. Se houver falha, preservar artefatos e investigar; sem repetição automática.
4. Após auditoria, a formal usa --pilot-state apontando para pilot-r2/state.json,
   --state para performance-v14/formal/state.json e --results para formal/results,
   no mesmo checkout 251ce74 e com as mesmas imagens. O prazo original é herdado.
5. Implementar a análise v14 específica dos contrastes registrados antes de
   interpretar resultados formais. Não usar o analisador v13 como substituto.

Não puxar commits posteriores de documentação no checkout congelado. Não há
resultado comparativo novo de desempenho neste registro; piloto serve para
validar a instrumentação. A formal planejada tem 80 células, não 100.
