import { isBlocking, type Finding } from "./domain"

const finding = (severity: Finding["severity"]): Finding => ({
  severity,
  category: "bug",
  title: "example",
  detail: "example",
})

if (!isBlocking(finding("blocker"))) throw new Error("blocker must block a pass")
if (!isBlocking(finding("major"))) throw new Error("major must block a pass")
if (isBlocking(finding("minor"))) throw new Error("minor must not block a pass")
if (isBlocking(finding("nit"))) throw new Error("nit must not block a pass")

console.log("team-mate selfcheck ok")
