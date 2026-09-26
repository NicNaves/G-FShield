# v14 — controle de paralelismo local

Esta etapa verifica quanto da vantagem observada frente ao monólito sequencial
pode ser explicado por avaliações paralelas, sem transformar diferenças de
implementação em prova de superioridade universal da distribuição.

## Controles

| Braço | Construção/busca sobrepostas | Paralelismo de vizinhança | Limite IWSSR |
| --- | --- | ---: | ---: |
| monolith | Não | 1 | 1 |
| monolith-n3 | Não | 3 | 3 |
| distributed-w1-n3 | Pipeline distribuído, concorrência 1 | 3 | 3 |
| distributed-w3-n3 | Pipeline distribuído, concorrência 3 | 3 | 3 |

O novo monólito mantém um controlador Python e **um único processo Java**, com
dados carregados uma vez, pool de três threads, projeções/classificadores locais
a cada avaliação e nenhuma memoização. Resultados são registrados na conclusão;
a redução que escolhe a próxima solução mantém a ordem de submissão e a regra
de desempate sequencial. Não são três cópias independentes do monólito.

No controle estrito v14, a seleção final usa o melhor snapshot de validação
observado dentro do prazo. Resultados tardios ficam nos registros de avaliações,
mas não entram na solução final. O holdout continua sendo avaliado uma única vez,
depois de drenar as avaliações iniciadas. Erros técnicos interrompem a célula.
As opções novas são opt-in e não alteram os artefatos ou imagens da v13.

## Protocolo pré-especificado

- Piloto técnico: semente 199, quatro células, 600 s de seleção + 300 s de reserva.
- Formal planejada: sementes 200–219, quatro braços, 80 células, 2.700 s de
  seleção + 300 s de reserva por célula. Não há liberação automática da formal.
- Teto global de dez dias, contado desde o início do piloto, sem renovação ao
  iniciar a formal. Uma tentativa por célula; falhas técnicas exigem inspeção.
- Mesmos hashes de dados, J48, ReliefF, RCL e limites de CPU/RAM da v13.
- Dois contrastes primários pareados de avaliações treinadas concluídas/s:
  monolith-n3 menos monolith; distributed-w1-n3 menos monolith-n3.
- Testes bilaterais exatos por inversão de sinais, Holm para dois contrastes,
  bootstrap pareado com 20.000 reamostragens, semente 20260926.
- Salvaguardas de macro-F1 no holdout, margem -0,005, avaliadas individualmente.
- Subconjuntos únicos, qualidade, CPU/RAM integradas, custo por avaliação e
  publicação são secundários; nenhuma configuração é escolhida pelo holdout.

O gate exige paralelismo real (>1 e <=3) no monólito n3, testes sintéticos com
J48 real, traces dentro do prazo, identidade da solução final, hashes e ausência
de contêiner experimental sobrevivente. Baixo F1 não é falha técnica.

## Limites que esta etapa não resolve

Ainda não há monólito com construção e busca local sobrepostas. Logo, o braço
distribuído w3 não isola distribuição de escalonamento do pipeline. A comparação
w1 também inclui diferenças de stack, partição de CPU e comunicação.

A inicialização dos dados/JVM entra na janela do monólito; no distribuído a
janela começa após prontidão dos serviços. Essa assimetria deve acompanhar toda
interpretação de vazão e tempo. As políticas de publicação também diferem;
por isso, AUC publicada não é o desfecho confirmatório desta etapa. Não afirmar
menor latência de cliente a partir de timestamps internos.

Para atribuição arquitetural mais forte, a etapa seguinte deve implementar o
pipeline no monólito, alinhar a origem temporal e medir CPU cumulativa do cgroup.
Ela exige protocolo próprio antes de novos resultados. A v14 não substitui isso.

## Execução e validação

```sh
mvn -f experiments/common-weka-evaluator/pom.xml -q -DskipTests package
GFS_WEKA_JAR="$PWD/experiments/common-weka-evaluator/target/common-weka-evaluator.jar" \
  python3 -m unittest discover -s experiments/10-day-campaign/tests -p 'test_parallel*py'
```

O executável de análise v13 rejeita v14 deliberadamente. A análise v14 deverá
usar a sua própria família de contrastes, não copiar conclusões estatísticas da
campanha anterior. Consultar [STATUS.md](STATUS.md) para o que realmente iniciou.
