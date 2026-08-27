import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ContractError, contentHash, LocalMemoryStore, MemoryWorkflowError, MemoryWorkflows } from '../../dist/index.js'

const roots: string[] = []
function root(): string { const value=join(tmpdir(),`axiom-workflows-${crypto.randomUUID()}`); mkdirSync(value); roots.push(value); return value }
test.afterEach(()=>{for(const value of roots.splice(0))rmSync(value,{recursive:true,force:true})})
const at='2026-08-27T00:01:00.000Z'
function invocation(operations: readonly any[], authority: 'model'|'trusted-host'|'user'='model', workspaceId='workspace:alpha') {
  const actorId=`actor:${authority}` as const; const callId=`call:${authority}` as const; const toolId='tool:memory' as const
  return { authority, context:{workspaceId:workspaceId as any,actorId,callId,toolId}, capability:{protocolVersion:'1.0' as const,capabilityId:`capability:${authority}` as const,workspaceId:workspaceId as any,actorId,toolId,callId,operations,issuedAt:'2026-08-27T00:00:00.000Z',expiresAt:'2026-08-27T00:05:00.000Z',nonce:'trusted'} }
}
function setup(options: ConstructorParameters<typeof MemoryWorkflows>[1]={}) { const store=new LocalMemoryStore(root(),{now:()=>new Date(at)}); store.createWorkspace('workspace:alpha',{maxBytes:10000,maxObjects:100}); store.createWorkspace('workspace:beta',{maxBytes:10000,maxObjects:100}); return {store,workflows:new MemoryWorkflows(store,{now:()=>new Date(at),...options})} }
const workflowCode=(code:string)=>(error:unknown)=>error instanceof MemoryWorkflowError&&error.code===code
const contractCode=(code:string)=>(error:unknown)=>error instanceof ContractError&&error.code===code

test('compute memory is bounded, revisioned, snapshotable, disposable, and restart-safe',()=>{
  const {store,workflows}=setup({computeLimits:{maxBytes:3,maxObjectBytes:3,maxObjects:1}}); const access=invocation(['compute.create','compute.read','compute.update','compute.snapshot','compute.release'])
  const object=workflows.createCompute(access,new Uint8Array([1,2])); assert.deepEqual(workflows.readCompute(access,object.id),new Uint8Array([1,2]))
  const updated=workflows.updateCompute(access,object.id,new Uint8Array([3])); assert.equal(updated.revision,2); const snapshot=workflows.snapshotCompute(access,object.id); assert.equal(snapshot.sourceRevision,2)
  assert.throws(()=>workflows.createCompute(access,new Uint8Array([4])),workflowCode('COMPUTE_OBJECT_LIMIT')); workflows.releaseCompute(access,object.id); assert.throws(()=>workflows.readCompute(access,object.id),workflowCode('COMPUTE_RELEASED'))
  assert.throws(()=>workflows.createCompute(access,new Uint8Array([1,2,3,4])),workflowCode('COMPUTE_OBJECT_TOO_LARGE')); workflows.close()
  const reopened=new MemoryWorkflows(store,{now:()=>new Date(at)}); assert.throws(()=>reopened.readCompute(access,object.id),workflowCode('COMPUTE_RELEASED')); reopened.close(); store.close()
})

test('active compute bytes are quota-bound and release returns semantic capacity',()=>{
  const {store,workflows}=setup({computeLimits:{maxBytes:3,maxObjectBytes:3,maxObjects:3}}); const access=invocation(['compute.create','compute.release'])
  const first=workflows.createCompute(access,new Uint8Array([1,2])); assert.throws(()=>workflows.createCompute(access,new Uint8Array([3,4])),workflowCode('COMPUTE_BYTE_LIMIT'))
  workflows.releaseCompute(access,first.id); workflows.createCompute(access,new Uint8Array([3,4])); workflows.close(); store.close()
})

test('working memory commits only an exact user-approved proposal and retains history',()=>{
  const {store,workflows}=setup(); const model=invocation(['working.propose','working.read']); const user=invocation(['working.approve','working.reject','working.supersede'],'user')
  const first=workflows.proposeWorking(model,'plan',{step:'measure'}); assert.equal(workflows.readWorking(model,'plan'),null)
  assert.throws(()=>workflows.approveWorking(model,first.id,{workspaceId:'workspace:alpha',proposalId:first.id,proposalHash:first.hash,decision:'approved'}),contractCode('AUTHORITY_NOT_PERMITTED'))
  assert.throws(()=>workflows.approveWorking(user,first.id,{workspaceId:'workspace:alpha',proposalId:first.id,proposalHash:contentHash({changed:true}),decision:'approved'}),contractCode('STALE_APPROVAL'))
  const committed=workflows.approveWorking<{step:string}>(user,first.id,{workspaceId:'workspace:alpha',proposalId:first.id,proposalHash:first.hash,decision:'approved'}); assert.equal(committed.revision,1); assert.deepEqual(workflows.readWorking(model,'plan')?.value,{step:'measure'})
  const rejected=workflows.proposeWorking(model,'plan',{step:'guess'}); assert.equal(workflows.rejectWorking(user,rejected.id).state,'rejected'); const superseded=workflows.proposeWorking(model,'plan',{step:'old'}); assert.equal(workflows.supersedeWorking(user,superseded.id).state,'superseded')
  assert.deepEqual(workflows.workingHistory(model,'plan').map(revision=>revision.revision),[1]); assert.ok(workflows.auditEvents().some(event=>event.outcome==='rejected'&&event.errorCode==='STALE_APPROVAL')); workflows.close(); store.close()
})

test('only trusted authority creates immutable artifacts with lineage and provenance',()=>{
  const {store,workflows}=setup(); const trusted=invocation(['artifact.create','artifact.derive','artifact.read'],'trusted-host'); const model=invocation(['artifact.create','artifact.read'])
  const provenance={operation:'seed',parametersHash:contentHash({}),softwareVersion:'1.0.0',validationId:null}; assert.throws(()=>workflows.createArtifact(model,new Uint8Array([1]),{type:'bytes'},provenance),contractCode('AUTHORITY_NOT_PERMITTED'))
  const rootArtifact=workflows.createArtifact(trusted,new Uint8Array([1]),{type:'bytes'},provenance); const derived=workflows.deriveArtifact(trusted,[rootArtifact.id],new Uint8Array([2]),{type:'bytes'},{...provenance,operation:'increment'})
  assert.deepEqual(derived.parentIds,[rootArtifact.id]); assert.deepEqual(workflows.readArtifact(model,rootArtifact.id),new Uint8Array([1])); assert.deepEqual(workflows.readArtifact(model,derived.id),new Uint8Array([2])); workflows.close(); store.close()
})

test('capabilities cannot cross workspaces or weaken another memory class',()=>{
  const {store,workflows}=setup(); const alpha=invocation(['compute.create']); const object=workflows.createCompute(alpha,new Uint8Array([1])); const beta=invocation(['compute.read'],'model','workspace:beta')
  assert.throws(()=>workflows.readCompute({...beta,capability:{...beta.capability,workspaceId:'workspace:alpha'}},object.id),contractCode('CROSS_WORKSPACE_ACCESS'))
  assert.throws(()=>workflows.readArtifact(invocation(['compute.read']),object.id),contractCode('OPERATION_NOT_PERMITTED')); workflows.close(); store.close()
})
