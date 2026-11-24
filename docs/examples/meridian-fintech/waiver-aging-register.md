# Active Waiver Aging Register — Meridian FinTech

> **Reference Date:** `2026-11-21` | **Active Cap Utilization:** `1 / 2` | **Max Window:** `<= 30d` | **Hard Stop Violations:** `0`

## Hard Stop Policy Attestation

- **Non-Waivable Hard Stop Stations:** AUTH / SSO (1 of 6), RESIDENCY (2 of 6)
- **Policy Rule:** Any waiver targeting a Hard Stop is rejected as `NO-GO`. Only operational stations (`WEBHOOKS`, `QUOTA / RATE`, `ALERTING`, `ROLLBACK`) may carry time-boxed waivers.

## Active Operational Waivers

| Station | Owner | Ticket | Expires At | Days Remaining | Aging Band | Reason | Rollback Plan |
|---|---|---|---|---|---|---|---|
| `ROLLBACK` | `maya.chen@meridian.example` | `MER-4182` | `2026-12-15` | 24d | `HEALTHY` | Automated blue/green ArgoCD cutover ships Sprint 24; verified manual DNS failover active. | Run scripts/dns-failover.sh --cluster eu-central-v18 to revert traffic within 9 minutes. |

## Live Support Drift-Detection Command

```bash
nominalx check examples/meridian-fintech/nominalx.yaml
```

*Verification Digest:* `sha256:2f56db49f8874997c147d076c4d162e05b05435789f8180cf9e1f6a87603b9da`
