import test from 'node:test';
import assert from 'node:assert/strict';
import {haversineKm, scoreForDistance, CESENA, bboxForRadius, parsePanoramaxFeature, createChallenge, readChallenge, deriveStats, eligibleInRegion, parseCommonsPage} from './core.mjs';
test('distance is zero for same point', () => assert.equal(haversineKm(CESENA,CESENA),0));
test('distance to a second known point', () => assert.ok(haversineKm(CESENA,{lat:44.0678,lng:12.5695})>25));
test('score decreases with distance and maxes at 5,000', () => {assert.equal(scoreForDistance(0),5000);assert.ok(scoreForDistance(1)>scoreForDistance(10));});
test('bbox wraps Cesena',()=>{const [w,s,e,n]=bboxForRadius(CESENA,10);assert.ok(w<CESENA.lng&&e>CESENA.lng&&s<CESENA.lat&&n>CESENA.lat);});
test('parse panorama',()=>{const p=parsePanoramaxFeature({id:'picture-123',collection:'seq-123',geometry:{coordinates:[12.25,44.14]},properties:{'pers:interior_orientation':{field_of_view:360}}});assert.equal(p.isPano,true);assert.equal(p.lat,44.14);});
test('share link roundtrip and tamper rejection',()=>{const a=[{provider:'pnx',id:'sample-123',collection:'seq-123'}];const c=createChallenge(a);assert.deepEqual(readChallenge(c).photos,[['p','seq-123','sample-123']]);assert.throws(()=>readChallenge('$$'));});
test('region boundaries',()=>{assert.equal(eligibleInRegion(CESENA),true);assert.equal(eligibleInRegion({lat:42,lng:10}),false);});
test('stats recognize a won game',()=>{const r=deriveStats({},[4000,4000,4000,4000,4000],false);assert.equal(r.won,1);assert.equal(r.best,20000);});

test('mixed source challenge keeps exact round sequence',()=>{const a=[{provider:'pnx',collection:'seq-1',id:'img-1'}, {provider:'commons',id:'18294593'}]; assert.deepEqual(readChallenge(createChallenge(a)).photos,[['p','seq-1','img-1'],['c','18294593']]);});
test('rejects malicious and oversized challenge links',()=>{assert.throws(()=>readChallenge('A'.repeat(5000)));assert.throws(()=>createChallenge([{provider:'mly',id:'42'}]));});
test('Commons parsed image must have precise location and usable license credits',()=>{const page={pageid:142,title:'File:Cesena view.jpg',coordinates:[{lat:44.14,lon:12.24}],imageinfo:[{mime:'image/jpeg',width:1800,height:1000,thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/test.jpg/1800px-test.jpg',extmetadata:{Artist:{value:'Test Author'},LicenseShortName:{value:'CC BY-SA 4.0'}}}]};const parsed=parseCommonsPage(page);assert.equal(parsed.provider,'commons');assert.match(parsed.credits,/CC BY-SA/);});
