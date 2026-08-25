package com.br.graspfs.dls.verify.dto;

import lombok.Data;
import lombok.Getter;
import lombok.Setter;

import com.br.graspfs.dls.verify.enuns.LocalSearch;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.UUID;


@Builder
@Setter
@Getter
@AllArgsConstructor
public class DataSolution {

    @JsonProperty("campaignId") private String campaignId;
    @JsonProperty("armId") private String armId;
    @JsonProperty("runId") private String runId;
    @JsonProperty("requestId") private String requestId;
    @JsonProperty("candidateId") private String candidateId;
    @JsonProperty("parentId") private String parentId;
    @JsonProperty("seed") private Integer seed;
    @JsonProperty("deadlineEpochMs") private Long deadlineEpochMs;
    @JsonProperty("stage") private String stage;
    @JsonProperty("timestampUtc") private String timestampUtc;
    @JsonProperty("monotonicElapsedMs") private Long monotonicElapsedMs;

    @JsonProperty("seedId")
    private UUID seedId;// id da mensagem

    @JsonProperty("solutionFeatures")
    private  ArrayList<Integer> solutionFeatures;// []

    @JsonProperty("rclfeatures") private  ArrayList<Integer> rclfeatures;// []

    @JsonProperty("neighborhood")
    private String neighborhood;// vnd

    @JsonProperty("enabledLocalSearches")
    private ArrayList<String> enabledLocalSearches;

    @JsonProperty("iterationNeighborhood")
    private Integer iterationNeighborhood; //01

    @JsonProperty("classfier")
    private String classfier;// J48

    @JsonProperty("f1Score")
    private Float f1Score;// 98%

    @JsonProperty("rclAlgorithm")
    private String rclAlgorithm;

    @JsonProperty("cpuUsage")
    private Float cpuUsage;

    @JsonProperty("memoryUsage")
    private Float memoryUsage;

    @JsonProperty("memoryUsagePercent")
    private Float memoryUsagePercent;

    @JsonProperty("localSearch")
    private LocalSearch localSearch; // BF

    @JsonProperty("runnigTime")
    private Long runnigTime;// tempo de execução

    @JsonProperty("iterationLocalSearch")
    private Integer iterationLocalSearch; //01

    @JsonProperty("trainingFileName")
    private String trainingFileName; // nome do arquivo de treino

    @JsonProperty("testingFileName")
    private String testingFileName; // nome do arquivo de teste

    @JsonProperty("useTrainingCache")
    private Boolean useTrainingCache;

    
    public DataSolution() {
    }

}

