{{/*
Chart name, truncated/sanitized for use in resource names.
*/}}
{{- define "rag-chatbot.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Release-qualified fullname, e.g. "rag-chatbot" or "my-release-rag-chatbot".
*/}}
{{- define "rag-chatbot.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Standard chart-wide labels.
*/}}
{{- define "rag-chatbot.labels" -}}
helm.sh/chart: {{ printf "%s-%s" (include "rag-chatbot.name" .) .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "rag-chatbot.name" . }}
{{- end -}}

{{/*
Selector labels for a given component (pass the component name as the second arg
via `include "rag-chatbot.selectorLabels" (list $ "backend")`).
*/}}
{{- define "rag-chatbot.selectorLabels" -}}
{{- $ctx := index . 0 -}}
{{- $component := index . 1 -}}
app.kubernetes.io/name: {{ include "rag-chatbot.name" $ctx }}-{{ $component }}
app.kubernetes.io/instance: {{ $ctx.Release.Name }}
{{- end -}}

{{/*
Fully-qualified component name, e.g. "rag-chatbot-backend".
*/}}
{{- define "rag-chatbot.componentFullname" -}}
{{- $ctx := index . 0 -}}
{{- $component := index . 1 -}}
{{- printf "%s-%s" (include "rag-chatbot.fullname" $ctx) $component | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Backend env vars, shared between the main container and the migration
initContainer (see templates/backend/deployment.yaml) so both always agree on
how to reach the database — one definition, not two copies to keep in sync.
*/}}
{{- define "rag-chatbot.backendEnv" -}}
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "rag-chatbot.componentFullname" (list . "secrets") }}
      key: postgres-password
# $(POSTGRES_PASSWORD) is a native k8s env-var reference — it only resolves
# because POSTGRES_PASSWORD is defined earlier in this list.
- name: DATABASE_URL
  value: >-
    postgresql+asyncpg://{{ .Values.timescaledb.username }}:$(POSTGRES_PASSWORD)@{{ include "rag-chatbot.componentFullname" (list . "timescaledb") }}:5432/{{ .Values.timescaledb.database }}
{{- end -}}

{{/*
Kong's declarative config (see templates/kong/configmap.yaml). Factored out
into its own template so templates/kong/deployment.yaml can hash the exact
same content for its checksum/config rollout-trigger annotation.
*/}}
{{- define "rag-chatbot.kongConfig" -}}
_format_version: "3.0"
_transform: true
services:
  - name: backend
    url: http://{{ include "rag-chatbot.componentFullname" (list . "backend") }}:{{ .Values.backend.containerPort }}
    routes:
      - name: backend-route
        paths:
          - /api
          - /docs
          - /redoc
          - /openapi.json
        strip_path: false
    plugins:
      - name: cors
        config:
          origins:
            - {{ printf "http://%s" .Values.ingress.host | quote }}
          methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
          headers: [Authorization, Content-Type, Accept]
          credentials: true
          max_age: 3600
      - name: rate-limiting
        config:
          minute: 60
          policy: local
{{- end -}}

{{/*
Pod-level securityContext for images we control (backend, frontend) — full
hardening, since we know exactly what UID they run as and what they write.
Takes the image's fixed UID as the second arg (`list $ 1000`): setting
`fsGroup` to it is what makes mounted emptyDir volumes (see each
deployment's volumeMounts) actually writable by that UID — without it,
Kubernetes creates them root-owned regardless of runAsUser, and e.g. the
backend's HuggingFace model cache write fails with EACCES. Confirmed by
reproducing that exact failure with plain `docker run --tmpfs` (no
Kubernetes-style fsGroup ownership handling) before adding this.
*/}}
{{- define "rag-chatbot.hardenedPodSecurityContext" -}}
{{- $uid := index . 1 -}}
runAsNonRoot: true
runAsUser: {{ $uid }}
fsGroup: {{ $uid }}
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{/*
Container-level securityContext for images we control.
*/}}
{{- define "rag-chatbot.hardenedContainerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ["ALL"]
{{- end -}}

{{/*
Container-level securityContext for third-party images (timescaledb, minio,
keycloak, kong) whose entrypoints we don't control. Deliberately NOT the full
hardened set above: several of these (Postgres-derived images especially)
start as root and drop privileges internally via their own entrypoint before
the main process runs, so k8s-level `runAsNonRoot: true` would refuse to even
start the container, and `readOnlyRootFilesystem: true` would need each
image's specific writable paths individually verified and emptyDir-mounted.
Still apply what's safe regardless of the image's own user model. A real
production deployment should replace these with managed equivalents anyway
(see Chart.yaml) rather than invest further in hardening them here.
*/}}
{{- define "rag-chatbot.restrictedContainerSecurityContext" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}
