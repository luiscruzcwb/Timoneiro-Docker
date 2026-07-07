package engine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"time"

	log "github.com/sirupsen/logrus"
)

type TrivyVulnerability struct {
	VulnerabilityID string `json:"VulnerabilityID"`
	Severity        string `json:"Severity"`
	PkgName         string `json:"PkgName"`
	Title           string `json:"Title"`
	Description     string `json:"Description"`
}

type TrivyResult struct {
	Target          string               `json:"Target"`
	Vulnerabilities []TrivyVulnerability `json:"Vulnerabilities"`
}

type TrivyReport struct {
	Results []TrivyResult `json:"Results"`
}

type CVESummary struct {
	Critical int
	High     int
	Medium   int
	Low      int
	Data     []TrivyVulnerability
}

// ScanImage runs Trivy against a Docker image and returns CVE counts.
// Uses local trivy binary if available, otherwise falls back to Docker.
func ScanImage(imageName string) (*CVESummary, error) {
	log.Debugf("Trivy: scanning %s", imageName)

	trivyBin, err := exec.LookPath("trivy")
	var cmd *exec.Cmd

	if err == nil {
		cmd = exec.Command(trivyBin,
			"image",
			"--format", "json",
			"--quiet",
			"--timeout", "5m",
			imageName,
		)
	} else {
		cmd = exec.Command("docker", "run", "--rm",
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-v", "/tmp/trivy-cache:/root/.cache/trivy",
			"aquasec/trivy:latest",
			"image",
			"--format", "json",
			"--quiet",
			"--timeout", "5m",
			imageName,
		)
	}

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("trivy start failed: %w", err)
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case err := <-done:
		if err != nil {
			log.Debugf("Trivy stderr: %s", stderr.String())
			return nil, fmt.Errorf("trivy scan failed: %w", err)
		}
	case <-time.After(6 * time.Minute):
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("trivy scan timed out")
	}

	var report TrivyReport
	if err := json.Unmarshal(out.Bytes(), &report); err != nil {
		return nil, fmt.Errorf("trivy output parse failed: %w", err)
	}

	summary := &CVESummary{}
	for _, result := range report.Results {
		for _, v := range result.Vulnerabilities {
			summary.Data = append(summary.Data, v)
			switch v.Severity {
			case "CRITICAL":
				summary.Critical++
			case "HIGH":
				summary.High++
			case "MEDIUM":
				summary.Medium++
			case "LOW":
				summary.Low++
			}
		}
	}

	log.Infof("Trivy[%s]: C=%d H=%d M=%d L=%d", imageName, summary.Critical, summary.High, summary.Medium, summary.Low)
	return summary, nil
}
