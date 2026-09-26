# G-FShield v13 — análise dos 100 experimentos

Atualização: 26/09/2026. Campanha formal concluída às 13:31:20 UTC
(10:31:20 de Brasília). Todos os cinco braços estão incluídos, sem seleção
por desempenho no conjunto de teste.

## Conclusão principal

Há evidência favorável a uma otimização específica do G-FShield: limitar a
concorrência efetiva do IWSSR a três avaliações melhorou a disponibilidade
acumulada de soluções qualificadas. O efeito principal fatorial foi positivo,
com p bilateral exato ajustado por Holm de **0,01172**.

Isso não prova superioridade geral da arquitetura distribuída. Frente ao
monólito sequencial, houve mais avaliações por segundo e mais execuções que
atingiram o limiar de qualidade, mas com consumo substancialmente maior de
CPU e RAM. Os contrastes com o monólito são secundários/descritivos, conforme
o protocolo congelado. Não foi testado um monólito paralelo.

## Desenho e integridade

- 20 sementes pareadas, 150–169; cinco configurações por semente: 100 execuções.
- Seleção durante 2.700 s; até 300 s reservados à finalização por execução.
- J48/Weka 3.8.6, ReliefF, RCL de 30, subconjunto inicial de cinco atributos,
  VND com IWSSR; parâmetros completos em [protocol.json](protocol.json).
- Distribuído: três construções/buscas em pipeline e paralelismo de vizinhança três.
- Memoização dos resultados das avaliações desabilitada em todos os braços.
  Cache de leitura dos dados habilitado no distribuído não substitui treinamento.
- Teto agregado de 6 CPUs e 12 GiB, incluindo Kafka/ZooKeeper no distribuído.
  Igualdade de teto não significa igualdade de utilização efetiva.
- Mesmo split congelado de treino, validação e teste. O teste não orientou a busca.
- Conferidos 1.220 hashes de artefatos nas 100 execuções; nenhum divergente.
- Suite Python: 93 testes aprovados no Windows; Linux: 93 executados, um skip
  específico de Windows e nenhuma falha. Não houve nova execução experimental
  nem alteração dos resultados brutos durante esta análise.

## Resultado primário: soluções qualificadas publicadas

A métrica AUC é a integral da quantidade acumulada de **subconjuntos distintos
publicados** com macro-F1 de validação >= 0,945, dividida pelos 2.700 s.
Ela recompensa quantidade e antecipação de soluções qualificadas; não é AUC-ROC,
não é o próprio F1 e não está limitada a 1. Avaliações internas não publicadas
não entram nessa métrica. Execuções sem solução qualificada contribuem com zero.

`e` indica publicação antecipada; `b` indica teto adicional de avaliações
simultâneas no processo IWSSR (0 = sem teto adicional, 3 = no máximo três).

| Configuração | AUC publicada média | Execuções com F1 de validação >= 0,945 | Macro-F1 de teste mediano | Avaliações/s medianas |
| --- | ---: | ---: | ---: | ---: |
| Monólito sequencial | 0,272179 | 5/20 | 0,944820 | 0,07352 |
| G-FShield e0-b0 | 0,275722 | 10/20 | 0,944993 | 0,11926 |
| G-FShield e0-b3 | 0,301599 | 11/20 | 0,945189 | 0,12574 |
| G-FShield e1-b0 | 0,370616 | 10/20 | 0,944993 | 0,11759 |
| G-FShield e1-b3 | 0,390210 | 11/20 | 0,945189 | 0,12444 |

Os dois efeitos principais foram calculados por semente, fazendo a média sobre
os dois níveis do outro fator. Testes bilaterais exatos por inversão de sinais,
com correção de Holm para os dois efeitos; IC95% bootstrap pareado com 20.000
reamostragens e semente 20260923.

| Efeito | Diferença média de AUC | IC95% | p ajustado | Interpretação |
| --- | ---: | --- | ---: | --- |
| Limite de treinamento 3 versus 0 | +0,022736 | [0,009612; 0,036565] | 0,011719 | Ganho sustentado neste desenho |
| Publicação antecipada ON versus OFF | +0,091753 | [-0,000302; 0,215105] | 0,164063 | Evidência insuficiente para confirmar ganho |
| Interação, exploratória | -0,006283 | [-0,026164; 0,014036] | Não aplicado | Sem evidência clara de interação |

O ganho do limite corresponde a aproximadamente 7,0% da AUC média dos braços
sem limite adicional, agregando os níveis de publicação. É uma razão de médias,
não um ganho garantido em cada execução: nove sementes tiveram efeito positivo,
duas negativo e nove zero. O mecanismo é compatível com menor disputa entre
avaliações, mas os dados não isolam a causa interna dessa melhoria.

## Qualidade, recursos e comparação com o monólito

| Configuração | CPU-h observadas, mediana | GiB-h observadas, mediana | Ganho de vazão versus monólito* | Subconjunto final, mediana | Redução dimensional, mediana |
| --- | ---: | ---: | ---: | ---: | ---: |
| Monólito | 0,8150 | 0,9389 | Referência | 13/51 | 74,51% |
| e0-b0 | 3,1241 | 3,2295 | +62,2% | 11/51 | 78,43% |
| e0-b3 | 3,1064 | 3,1608 | +71,0% | 11/51 | 78,43% |
| e1-b0 | 3,1245 | 3,2011 | +59,9% | 11/51 | 78,43% |
| e1-b3 | 3,1009 | 3,1099 | +69,3% | 11/51 | 78,43% |

*Razão entre medianas de avaliações concluídas por segundo, não mediana dos
ganhos pareados nem estimativa de eficiência por CPU. Candidatos concluídos
depois do prazo foram excluídos; houve um candidato tardio por monólito.

Na configuração e1-b3, o custo mediano observado foi 3,80 vezes o de CPU e
3,31 vezes o de memória do monólito. O aumento de vazão não compensou esse
aumento de CPU: não há demonstração de menor custo por avaliação nesta campanha.
O ganho de vazão descritivo de e0-b3 foi o maior, enquanto e1-b3 teve a maior
AUC publicada média. São critérios diferentes; isso não autoriza escolher um
vencedor universal após observar os resultados.

No contraste pareado e1-b3 menos monólito, a diferença média de AUC foi
+0,118031, IC95% [-0,058122; 0,282105]. Portanto, a diferença observada não
estabelece superioridade na métrica primária frente ao monólito.
A diferença média de macro-F1 de teste foi +0,000803, IC95%
[0,000148; 0,001504]: pequena, exploratória e sem correção para toda a família
de comparações secundárias. Não deve ser apresentada como confirmação geral.

O maior macro-F1 de teste desta campanha foi 0,947131788166 nos quatro braços
distribuídos e 0,945967735184 no monólito. Máximos são descritivos e não provam
superioridade; nenhuma configuração foi ajustada a partir desses máximos.

As três configurações modificadas passaram individualmente na salvaguarda de
não inferioridade de F1 versus e0-b0, com margem -0,005. Limites inferiores
unilaterais de 95%: e0-b3 +0,000122; e1-b0 -0,000058; e1-b3 +0,000143.
Isso não constitui uma garantia simultânea nem comparação de equivalência
com o monólito. Precisão, revocação e todos os valores por execução estão nos
JSONs vinculados abaixo.

## Tempo e observabilidade

O JSON do verificador registra o evento de publicação, não o instante em que
um cliente recebeu a solução. Logs de consumo Kafka confirmaram o limiar em
10/20, 11/20, 10/20 e 11/20 execuções dos quatro braços distribuídos,
respectivamente. Não se igualou esse endpoint à escrita local do monólito.

Sem atingir o limiar, o tempo permanece censurado em 2.700 s. A média dos
tempos truncados/censurados foi 2.228,43 s no monólito e 1.956,98 s em e1-b3;
a diferença pareada foi -271,45 s, IC95% [-628,25; 76,78]. O intervalo inclui
zero: não há confirmação de menor tempo até o limiar nesse contraste. Essa
estatística não é o tempo médio eventual de sucesso nem a média só dos sucessos.

Os picos registrados de avaliações IWSSR foram até cinco sem o teto adicional
e exatamente três com o teto. O atraso mediano entre conclusão e submissão
antecipada foi aproximadamente 1,3 ms (mediana das medianas por execução);
isso é diagnóstico do produtor, não latência Kafka ou ponta a ponta.

## Limitações da medição

- CPU e RAM foram integradas por trapézios nos timestamps observados, somente
  dentro da seleção. Não foram incluídos treinamento final/holdout ou preenchidos
  intervalos ausentes com zero. São estimativas, não contadores exatos de CPU.
- Cobertura mínima de 97,96% usando limite de lacuna de 120 s. Na análise de
  sensibilidade que descarta intervalos acima de 60 s, a cobertura mínima cai
  a 90,52%. Os totais observados não devem ser tratados como consumo integral
  perfeitamente medido nem usados para afirmar pequenas economias de recursos.
- Docker stats não mede todos os componentes simultaneamente; o timestamp é
  obtido antes dos subprocessos de coleta. A maior lacuna observada foi 76,53 s.
- A origem UTC do monólito foi reconstruída de timestamp menos tempo monotônico;
  a dispersão máxima dessa estimativa ficou em cerca de 1,01 ms.
- Nenhuma publicação ficou a até 1e-7 do limiar, segundo a auditoria numérica.
- Um host e um split fixo. As 20 sementes medem trajetórias de busca, não
  variabilidade independente de hardware ou datasets. Inversão de sinais exige
  permutabilidade/simetria sob a hipótese nula; não é inferência sem pressupostos.
- A métrica publicada depende também da política de publicação. Não demonstra
  sozinha melhora da trajetória algorítmica, resiliência ou escalabilidade multihost.

## Rastreabilidade e reprodução

- Execução congelada: `5ad942cd22360231d4d2a9e968ad91c1bc9b9a19`.
- Analisador: commit `b2fc64a`, na branch `experiment/performance-v13`.
- [Relatório gerado automaticamente](evidence/analysis-20260926/REPORT.md).
- [Métricas por execução](evidence/analysis-20260926/run-level.json).
- [Contrastes, intervalos e resumos completos](evidence/analysis-20260926/analysis.json).
- [Proveniência, versões e hashes](evidence/analysis-20260926/provenance.json).

Os quatro arquivos foram copiados do servidor e tiveram seus SHA-256 conferidos
localmente. O analisador recusa sobrescrever uma saída existente. O checkout de
execução e os dados brutos permaneceram inalterados; a análise rodou em checkout
separado `/home/idscps/nicolas/G-FShield-analysis-v13`, Python 3.10.12 e NumPy 2.2.6.

```sh
OPENBLAS_NUM_THREADS=1 /home/idscps/nicolas/experiment-artifacts/performance-v12/analysis-venv/bin/python \
  experiments/architecture-causal-campaign/analyze_performance_v13.py \
  --state /home/idscps/nicolas/experiment-artifacts/performance-v13/formal/state.json \
  --output /home/idscps/nicolas/experiment-artifacts/performance-v13/analysis-NOVA
```

## Próximos passos

1. Incorporar estes resultados e ressalvas de forma equivalente em PT/EN, sem
   reescrever retroativamente as hipóteses. As dissertações não foram editadas
   nesta etapa de análise.
2. Para distinguir distribuição de paralelismo, pré-registrar um monólito
   paralelo com o mesmo número de avaliações concorrentes, algoritmo e orçamento.
3. Medir CPU por contadores cumulativos de cgroup e publicar timestamps
   correlacionados de conclusão, submissão, ACK e consumo por ID de candidato.
4. Só então testar novas otimizações de projeções/cópias e overhead de coleta,
   em ablações separadas. Não ajustar algoritmos pelo desempenho do holdout atual.
5. Validar em outros splits/datasets antes de generalizar. Falhas, recuperação,
   múltiplos hosts e operação contínua continuam exigindo experimentos próprios.

Nenhuma nova campanha foi iniciada automaticamente. As configurações padrão do
sistema continuam preservadas; esta análise não alterou flags de produção.
