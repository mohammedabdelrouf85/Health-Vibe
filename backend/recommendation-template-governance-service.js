"use strict";

const crypto = require("crypto");
const { CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS } = require("./clinical-reviewer-service");

const COLLECTION = "clinicalRecommendationTemplateChanges";
const PUBLISHED_DOC = "published";
const MAX_TEXT_LENGTH = 4000;

function contentOnly(value) {
  const { sha256, ...content } = value || {};
  return content;
}

function validateTemplateShape(candidate, baseline = CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS) {
  const errors = [];
  function walk(value, reference, path) {
    if (typeof reference === "string") {
      if (typeof value !== "string") {
        errors.push(`${path} must be text`);
      } else if (!value.trim() || value.length > MAX_TEXT_LENGTH) {
        errors.push(`${path} must contain 1-${MAX_TEXT_LENGTH} characters`);
      } else if (/<\/?(script|iframe|style)|javascript:/i.test(value)) {
        errors.push(`${path} contains prohibited markup`);
      }
      return;
    }
    if (Array.isArray(reference)) {
      if (!Array.isArray(value) || value.length !== reference.length) errors.push(`${path} must match the approved list structure`);
      else reference.forEach((entry, index) => walk(value[index], entry, `${path}[${index}]`));
      return;
    }
    if (!reference || typeof reference !== "object") {
      if (value !== reference) errors.push(`${path} cannot be changed`);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    const expectedKeys = Object.keys(reference).sort();
    const actualKeys = Object.keys(value).sort();
    if (expectedKeys.join("|") !== actualKeys.join("|")) errors.push(`${path} fields cannot be added or removed`);
    expectedKeys.forEach((key) => walk(value[key], reference[key], `${path}.${key}`));
  }
  walk(candidate, contentOnly(baseline), "template");
  return { valid: errors.length === 0, errors };
}

function digest(content) {
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

class RecommendationTemplateGovernanceService {
  constructor(db) {
    this.db = db || null;
  }

  collection() {
    if (!this.db) throw new Error("PERSISTENCE_UNAVAILABLE");
    return this.db.collection(COLLECTION);
  }

  async getPublished() {
    if (!this.db) return { ...contentOnly(CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS), sha256: digest(contentOnly(CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS)), source: "certified-baseline" };
    const snapshot = await this.collection().doc(PUBLISHED_DOC).get();
    if (!snapshot.exists) return { ...contentOnly(CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS), sha256: digest(contentOnly(CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS)), source: "certified-baseline" };
    return snapshot.data();
  }

  async listPending() {
    const snapshot = await this.collection().where("status", "==", "pending_clinical_qa").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async propose({ content, actor }) {
    const validation = validateTemplateShape(content);
    if (!validation.valid) {
      const error = new Error("INVALID_TEMPLATE");
      error.details = validation.errors;
      throw error;
    }
    const current = await this.getPublished();
    const ref = this.collection().doc();
    const proposal = {
      content,
      contentSha256: digest(content),
      basedOnSha256: current.sha256,
      status: "pending_clinical_qa",
      createdAt: new Date().toISOString(),
      proposedBy: { uid: actor.uid, email: actor.email || null, role: actor.role },
      approvedAt: null,
      approvedBy: null,
      reviewerNotes: null
    };
    await ref.create(proposal);
    return { id: ref.id, ...proposal };
  }

  async review({ proposalId, decision, reviewer, notes }) {
    if (!this.db) throw new Error("PERSISTENCE_UNAVAILABLE");
    if (!proposalId || !["approve", "reject"].includes(decision)) throw new Error("INVALID_REVIEW");
    const ref = this.collection().doc(proposalId);
    return this.db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(ref);
      if (!proposalSnap.exists || proposalSnap.data().status !== "pending_clinical_qa") throw new Error("PROPOSAL_NOT_PENDING");
      const proposal = proposalSnap.data();
      const currentRef = this.collection().doc(PUBLISHED_DOC);
      const currentSnap = await tx.get(currentRef);
      const current = currentSnap.exists ? currentSnap.data() : null;
      const currentHash = current?.sha256 || digest(contentOnly(CERTIFIED_RECOMMENDATIONS_AND_DISCLAIMERS));
      if (decision === "approve" && proposal.basedOnSha256 !== currentHash) throw new Error("PUBLISHED_VERSION_CHANGED");
      const reviewedAt = new Date().toISOString();
      const update = {
        status: decision === "approve" ? "approved" : "rejected",
        reviewedAt,
        reviewerNotes: String(notes || "").trim().slice(0, 2000),
        reviewedBy: { uid: reviewer.uid, email: reviewer.email || null, role: reviewer.role }
      };
      tx.update(ref, update);
      if (decision === "approve") {
        tx.set(currentRef, {
          ...proposal.content,
          sha256: proposal.contentSha256,
          version: `HV-CLIN-RECOM-${proposal.contentSha256.slice(0, 12)}`,
          approved: true,
          approvedAt: reviewedAt,
          approvedBy: update.reviewedBy,
          sourceProposalId: proposalId
        });
      }
      const auditRef = this.collection().doc(`audit_${crypto.randomUUID()}`);
      tx.create(auditRef, {
        recordType: "clinical_recommendation_template_review",
        proposalId,
        action: decision === "approve" ? "PUBLISH_APPROVED_TEMPLATE" : "REJECT_TEMPLATE",
        actor: update.reviewedBy,
        notes: update.reviewerNotes,
        timestamp: reviewedAt
      });
      return { id: proposalId, ...proposal, ...update };
    });
  }
}

module.exports = {
  RecommendationTemplateGovernanceService,
  validateTemplateShape,
  digest,
  COLLECTION,
  PUBLISHED_DOC
};
