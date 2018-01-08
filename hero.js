
var genes = [
	1.2025510560928943,    //  0  resist staying in one place
	1.1939924347161504,    //  1  per-health ranged value of approaching weaker ally
	1.879316638529472,     //  2  per-health ranged value of approaching weaker enemy
	0.017901073460014554,  //  3  ranged base-value of grabbing mines, per my health above 20 (see also [18])
	9.757564591533008,     //  4  per-health ranged value of wells
	0.10075675889873756,   //  5  overall ranged score multiplier
	44.668982798047985,    //  6  base value of a life (minus health)
	2.697598128846651,     //  7  value of a mine (minus 20)
	0.8026840741831043,    //  8  bias against reversing
	4.283007497231664,     //  9  factor to scale the 1/distance value curve
	0.6406236093983964,    // 10  give a bonus to the best long-range target
	0.27391618485617575,   // 11  additional value of healer-type allies
	0.11945780795964063,   // 12  how much to value our own health over the health of others.
	1.4428374065636056,    // 13  value (per missing health up to 30) of landing adjacent to a well. If it exceeds 1+genes[12] then masochism may set in, but the optimizer keeps arriving there.
	12.881123761766547,    // 14  penalty for mine-taking moves where we'd expect to take additional damage
	9.024001616297456,     // 15  base ranged value of an enemy
	0.08486950869272165,   // 16  discount distances by the nearest distance of that object type, enabling subsequent targets to follow a different value scale.
	0.25317747906265514,   // 17  growing per-turn bias factor against reversal moves
	15.010772111139625,    // 18  additional ranged value per health of a mine at 1250 turns
	3.9560279583919176,    // 19  bonus to attacking a neighbor we'd identified as a "doom bringer" that we can overtake if they run like an aggressor, but who would kill us if we ran first.
	2.6373903728435053,    // 20  turn-1250 "rage" multiplier to value of chasing enemies if we're in lose-by-default zero-mine round.
	0.7780323743765387,    // 21  if we don't really need diamonds, we stop pursuing (ranged) when diamondBonus reaches this value
	0.5320730169026482,    // 22  each time we reverse direction, we increase the ranged value we put on the first instance of something by this, while reducing subsequent
	0.35237124627819993,   // 23  strategic bonus multiplier, from looking at hero/friend and their adjacent tiles
	0.4101475689521007,    // 24  added a second round to the prediction. this is its weight.
	1.0790145165779128,    // 25  indirect vs direct path bias.
	0.11887748344083765,   // 26  forward target bias (favoring targets that we chose last round)
	1.3633695000903634     // 27  friendly mine capture penalty
]; 

var gameData, helpers;
var myHero;
var myTurns = 0;
var numReverse = 0;

var wantDiamonds = false;

function getTeamScore(game, hero) { //note that hero is genuine copy, not post-simulation
	var heroes = game.heroes;
	var board = game.board;
	var score=0;
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		if(!h.dead) {
			var s = h.health;
			if(h.id===hero.id) {
				s += s*genes[12] + 200; //value our life above others
				if(helpers.getAdjacentFilter(h, board, helpers.isWell).length>0) {
					s += Math.min(100-h.health, 30) * genes[13];
				}
				//if(wantDiamonds) {
					var minesTaken = h.mineCount-hero.mineCount;
					if(minesTaken>0 && hero.health-h.health>20*minesTaken) s-=genes[14]; //penalize taking mines while under attack
				//}
			}
			s += genes[6];
			/*if(wantDiamonds) */ s += (20+genes[7])*h.mineCount;
			
			score += s * ((h.team===hero.team)?1:-1);
		}
	}
	return score;
}

var dossier;

//tries to classify a hero and guess their next move
function mimic(hero, board) {
	var d = dossier[hero.id];
	
	if(hero.distanceFromLeft!=d.startX || hero.distanceFromTop!=d.startY) d.moved = true;

	var miner = hero.diamondsEarned>0;
	var healer = hero.healthGiven>0;
	if(hero.damageDone%20===10) d.fighter = true; //distinguish direct attacks from indirect
	var fighter = d.fighter;
	var target;
	
	if(hero.id===myHero.id) miner=healer=fighter=true;
	
	if(!healer && !miner && !fighter && (myTurns<=2 || d.moved) && myTurns<=10) {
		//aggressor is so common, we want to just assume that until we observe better
		fighter = true;
	}
	
	var well = helpers.findFirst(hero, board, helpers.isWell);
	
	var mine = miner && helpers.findFirst(hero, board, helpers.isOtherMine);
	
	if(fighter) {
		var enemy = helpers.findFirst(hero, board, helpers.isEnemy);
		
		//chase weakest of nearest enemies
		if(!healer && !miner) {
			//aggressor mode, the most common fork
			d.type = "aggressor";
			if(hero.health<=30) {
				target = well;
			} else {
				target = enemy;
			}
		} else {
			//assume something wiser
			d.type = "adventurer";
			
			if(well && hero.health<((well.distance===1)?100:50)) {
				target = well;
			} else {
				if(healer) {
					//may heal adjacent allies
					var ally = helpers.findFirst(hero, board, helpers.isAlly);
					if(ally && ally.tile.health<=60) target = ally;
				}
				if(miner && !target) {
					//may chase mine if full health
					if(hero.health===100) target = mine;
				}
				
				if(enemy && (!target || enemy.distance<target.distance)) {
					var weakerEnemy = helpers.findFirst(hero, board, helpers.isWeakerEnemy);
					if(weakerEnemy && weakerEnemy.distance<=enemy.distance) {
						target = weakerEnemy;
					} else {
						target = enemy;
					}
				}
			}
			
			
		}
	} else {
		
		if(healer) {
			//assume priest
			d.type = "priest";
			
			if(well && hero.health<((well.distance===1)?100:60)) { //ugly duplication
				target = well;
			} else {
				target = helpers.findFirst(hero, board, helpers.isAlly);
			}
		} else if(miner) {
			//assume safeDiamondMiner
			d.type = "safeDiamondMiner";
			if(well && hero.health<((well.distance===1)?100:40)) {
				target = well;
			} else {
				target = mine;
			}
		} else if(d.moved) {
			d.type = "survivor";
			if(well) target = well;
		} else {//else they're probably broken
			d.type = "zombie";
		}
	}

	
	var dir = "Stay";
	
	if(target) {
		dir = target.dir;
		
		var tile = target.tile;
		if(tile.type==="Hero" && !tile.dead) {
			d.targets[tile.id] = myTurns;
		}
	}
	
	return dir;
}

var lastTargets;
var targetsByDir = {};

function forwardTargetBias(target, direct) {
	// we sometimes get stuck in a tug-o-war between multiple distant targets, so embrace the sunken cost "fallacy" to keep us moving forward
	var key = direct?"d":"i";
	var tile = target.tile;
	if(tile.type==="Hero") key += "h"+tile.id;
	else key += tile.distanceFromLeft+","+tile.distanceFromTop;
	
	var ret=1.0;
	
	if(lastTargets) { // if our last action was a movement
		//targets coinciding with out last action get a bonus, while the rest get a penalty
		ret = 1+genes[26];
		if(!lastTargets[key]) ret = 1/ret;
	}
	
	// while we're at it, remember the target for next round
	if(!targetsByDir[target.dir]) targetsByDir[target.dir]={};
	targetsByDir[target.dir][key] = 1;
	if(target.altDir && target.altDir!==target.dir) {
		if(!targetsByDir[target.altDir]) targetsByDir[target.altDir]={};
		targetsByDir[target.altDir][key] = 1;
	}
	
	return ret;
}

function evaluate(direction) {
	var game = helpers.clone(gameData);
	var nextHero;
	
	var mover = function(hero, board) {
		if(hero.id===myHero.id) {
			nextHero = hero;
			return direction;
		} else {
			return mimic(hero, board);
		}
	}
	
	//simulate a round of turns
	helpers.simulate(game, mover);
	var score = getTeamScore(game, myHero);
	nextHero = helpers.clone(nextHero);
	
	//another round for good measure
	helpers.simulate(game, mimic);
	var s = getTeamScore(game, nextHero);
	
	
	return score*(1-genes[24]) + s*genes[24];
	
	/*
	//so slow...
	nextHero = helpers.clone(nextHero);
	var first = true, best = score;
	var g;
	for(var dir in helpers.Directions) {
		if(!g) g = helpers.clone(game);
		if(helpers.validMove(g.board, nextHero, dir)) {
			direction = dir;
			helpers.simulate(g, mover);
			var s = getTeamScore(g, nextHero);
			if(first || s>best) {
				best = s;
				first = false;
			}
			g=0;
		}
	}
	
	return score*0.9+best*0.1;
	*/
	
}

var totalMines=0;

function countMines() {
	totalMines=0;
	var wh = gameData.board.lengthOfSide;
	var tiles = gameData.board.tiles;
	
	for(var y=0; y<wh; y++) {
		for(var x=0; x<wh; x++) {
			var tile = tiles[y][x];
			if(tile.type==="DiamondMine") totalMines++
		}
	}
}

function needDiamonds() {
	var td = gameData.totalTeamDiamonds;
	
	var loseByDefault = myHero.team!==0;
	var weHaveDiamonds = td[myHero.team]>0;
	var theyHaveDiamonds = false;
	var theyHaveMore = false;
	var theyHaveMiners = false;
	var haveSame = false;
	var theyHaveFighters = false;
	
	for(var i=0;i<td.length; i++) {
		if(i!==myHero.team && td[i]>0) {
			theyHaveDiamonds = true; //no longer used
			if(td[i]>td[myHero.team]) theyHaveMore=true;
			if(td[i]==td[myHero.team]) haveSame=true;
		}
	}
	
	var heroes = gameData.heroes;
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		if(h.team!==myHero.team && !h.dead) {
			if(h.mineCount>0) theyHaveMiners = true;
			var d = dossier[h.id];
			if(d && d.fighter) theyHaveFighters = true;
		}
	}
	
	if(theyHaveMore || theyHaveMiners || !theyHaveFighters) {
		return true;
	}

	if(loseByDefault) {
		return haveSame || !weHaveDiamonds;
	} else {
		return false;;
	}
	
	// if not, grabbing mines may still be useful. The enemy may not have diamonds now, but they might grab some later.
	// But if they don't, then we don't need to ramp up our efforts unless we're in a lose-by-default scenario
}

function strategicImportance(hero) {
	var tiles = helpers.getAdjacent(hero, gameData.board);
	var friends=0, enemies=0, wells=0;
	for(var i=0;i<tiles.length; i++) {
		var tile = tiles[i];
		if(tile.type==="Hero" && tile.id===myHero.id) continue;
		
		if(helpers.isAlly(tile, hero) && tile.healthGiven>0) friends++;
		else if(helpers.isAlly(tile, hero)) enemies++;
		else if(helpers.isWell(tile)) wells++;
	}
	var d = dossier[hero.id];
	
	var score = 30*enemies-40*friends; //an ally facing 1 enemy, or conversely an enemy facing 1 ally, is important
	if(wells>0 && d.type!=="zombie") score-=30; //having a well is like having a 3/4 friend.
	
	if(score>40) score=0; // it's hopeless, so forget them
	
	
	if(enemies>friends) { //additional importance
		if(hero.healthGiven>0 || (wantDiamonds && hero.mineCount>0)) score+=20; //protect our miners
		if(d && d.fighter) score+=10;
	}
	
	return score * genes[23];
}

var lastMove="Stay";

//avoid the long-range strategy getting us into situations that the short-range strategy will fight to keep us out of.
//We get stuck in reversal loops when that happens. So just mark them for avoidance before pathfinding, and get more aggressive the more we reverse;
function markDanger() {
	//if(myHero.health<=20+10*numReverse) {
		var heroes = gameData.heroes;
		for(var i=0; i<heroes.length; i++) {
			var h = heroes[i];
			if(h.team!==myHero.team && !h.dead) {
				var d = dossier[h.id];
				var adj = helpers.getAdjacentFilter(h, gameData.board, helpers.passable);
				for(var j=0; j<adj.length; j++) {
					if(h.health>20) adj[j].danger = true;
					if(d.fighter) { //if they're fighters, 2 away is dangerous too
						var adj2 = helpers.getAdjacentFilter(adj[j], gameData.board, helpers.passable);
						for(var k=0; k<adj2.length; k++) {
							adj2[k].danger = true;
						}
					}
				}
			}
		}
	//}
}

function ramp(x) { //take 0-1 and adjust it to start with a steeper slope.
	if(x<0) return 2*x; //handle impossible out-of-bounds, should that ever change
	if(x>1) return 1;
	return 2*x-x*x;
}

function evalMoves() {
	var scores = {};
	
	targetsByDir = {};
	
	wantDiamonds = needDiamonds();
	
	
	/*
		Short range strategy:
		For each direction, we guess how the next round of turns will play out,
		then calculate a team score.
	*/
	var noStay = false;
	for(var dir in helpers.Directions) {
		if(helpers.validMove(gameData.board, myHero, dir)) {
			scores[dir] = evaluate(dir);
			if(dir==="Stay") {
				scores[dir]-=genes[0]; // bias against staying in one place
			} else  {
				var tile = helpers.getMoveTile(gameData.board, myHero, dir);
				if(helpers.isEnemy(tile) || (helpers.isAlly(tile) && tile.health<100) || (helpers.isWell(tile)&&myHero.health<100)) {
					noStay = true; //sometimes staying is not acceptable, no matter what the simulator says.
				}
				if(helpers.isAllyMine(tile,myHero)) {
					//I've caught him taking mines without any incentive, as an alternative to staying or moving. Provide some disincentive (but taking from a dying ally may be prudent)
					scores[dir] -= genes[27]*(100-tile.owner.health)/100;
				}
			}
		}
	}
	
	if(noStay && scores.hasOwnProperty("Stay")) delete scores["Stay"]; //patch over the symptoms of a serious bug I haven't found

	markDanger();
	
	/*
		Long range strategy:
		Find all reachable targets to offset scores for their respective directions.
	*/
	var directTargets = helpers.pathFind(myHero, gameData.board, true, function(tile) {
		return helpers.isAlly(tile) ||	helpers.isOtherMine(tile, myHero) || helpers.isWell(tile) || helpers.isEnemy(tile);
	});
	//requery for safer paths to all the friendly targets. We'll combine scores with directBias later to decide which to favor
	var indirectTargets = helpers.pathFind(myHero, gameData.board, true, function(tile) {
		return helpers.isAlly(tile) ||	helpers.isOtherMine(tile, myHero) || helpers.isWell(tile);
	}, 0, 0, function(tile) {
		return tile.danger;
	});
	
	targets = directTargets.concat(indirectTargets);
	
	var directScore = myHero.health;
	var indirectScore = (10*numReverse + 100-myHero.health)*genes[25];
	var directBias = directScore/(directScore+indirectScore);
	
	
	var diamondBonus = genes[3] + genes[18]*ramp(gameData.turn/1250);
	
	if(!wantDiamonds && diamondBonus>genes[21]) diamondBonus = 0; //we stop collecting diamonds if it turns out we won't need them
	

	var rage = 1.0;
	if(myHero.team==1 && totalMines==0) rage += genes[20]*ramp(gameData.turn/1250);
	
	var firstBonus = 1+genes[22]*numReverse;
	
	var best, bestValue;
	var first = {};
	var doomBringer;
	var canHeal=false;
	for(var i=0; i<targets.length; i++) {
		var target = targets[i];
		var tile = target.tile;
		var value = 0;
		var kind="???";
		
		var direct = i<directTargets.length; 
		
		var bias = direct?directBias:(1-directBias);
		
		var d = tile.type==="Hero" && dossier[tile.id];
		
		if(helpers.isAlly(tile)) {
			kind="ally";
			value = bias * genes[1]*(100-tile.health+strategicImportance(tile));
			if(tile.healthGiven>0) {
				value += genes[11]*(100-myHero.health); //treat healers like extra semi-wells. made almost no difference in testing :-/
				if(tile.distance==1) canHeal = true;
			}
		} else if(helpers.isEnemy(tile)) {
			kind="enemy";
			value = Math.max(genes[15]+genes[2]*(myHero.health*rage-tile.health+strategicImportance(tile)), 0);
			
			//identify a specific scenario where we have no choice but to fight to the death, and no enemies are nearby, and I am their definite target
			if(target.distance==1) {
				if(!first[kind]) {
					//console.log(JSON.stringify(d));
					if(d && d.fighter && d.targets[myHero.id]===myTurns) {
						var maxHits = Math.floor((myHero.health-10)/30);
						if(tile.health<=30+maxHits*30) { //if we even stand a chance.
							var justMe = true;
							for(var nt in d.targets) {
								if(+nt!==+myHero.id && d.targets[nt]===myTurns) justMe = false;
							}
							if(justMe) doomBringer=target;
						}
					}
				} else {
					doomBringer=0;
				}
			} else if(target.distance==2) {
				doomBringer=0;
			}
		} else if(helpers.isOtherMine(tile, myHero)) {
			kind="mine";
			value = bias * diamondBonus*Math.max(myHero.health-20, 0);
		} else if(helpers.isWell(tile)) {
			kind="well";
			value = bias * genes[4]*(100-myHero.health);
			if(target.distance==1) canHeal = true;
		}
		
		if(scores.hasOwnProperty(target.dir)) { // skip if validMove() identified the direction as pointless
			var f = first[kind];
			var isFirst = false;
			if(!f) { f = first[kind] = tile; isFirst = true; }
			var adjustedDistance = target.distance - (f.distance-1)*genes[16]; //discount by nearest so we don't sit in our corner when there are no near targets.
			
			value /= 1+(adjustedDistance-1)*genes[9];
			if(isFirst) {
				value*=firstBonus; //fight the tendency to oscillate at intersections by giving first match a bonus
			} else {
				value/=firstBonus;
			}
			value *= forwardTargetBias(target, direct);
			
			scores[target.dir] += genes[5]*value;
			if(target.altDir!==target.dir && scores.hasOwnProperty(target.altDir)) {
				scores[target.altDir] += genes[5]*value; //sometimes there's two equal routes to one target
			}
			
			if(!best || value>bestValue) {
				best = target; bestValue = value;
			}
		}
	}
	if(doomBringer && !canHeal && scores.hasOwnProperty(doomBringer.dir)) {
		//console.log("dooom!");
		scores[doomBringer.dir] += genes[19]; // TODO this gene is going really low. Perhaps we're including less-dire situations and bringing them down by accident
	}
	
	if(best) {
		scores[best.dir] += genes[10];
		if(best.altDir!==best.dir && scores.hasOwnProperty(best.altDir)) {
			scores[best.altDir] += genes[10];
		}
		
	}
	
	var avoid = helpers.Inverse[lastMove];
	if(scores.hasOwnProperty(avoid)) scores[avoid]-=genes[8]*(1+numReverse*genes[17]);  // bias against reversing our last turn
	
	
	return scores;
}


function newGame() {
	//forget/reset things that we're not supposed to remember between games
	//so that it doesn't skew hero-crucible testing
	
	dossier = [];
	var heroes = gameData.heroes;
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		dossier[h.id] = {
			type:"", fighter: false,
			startX: h.distanceFromLeft, startY: h.distanceFromTop,
			targets: {}
		};
	}
	myTurns = 0;
	numReverse = 0;
	lastMove = "Stay";
	countMines();
	//if(myHero.team==1 && totalMines==0) console.log("raaage!");
}

var lastTurn = 0;

function move(g, h, _genes) {
	(helpers = h).setGameData(gameData = g); // :p
	myHero = g.activeHero;
	
	if(_genes && Array.isArray(_genes) && _genes.length===genes.length) genes = _genes; //facilitate training, but future-proof
	
	if(!dossier || gameData.turn<lastTurn) newGame();
	
	myTurns++;
	
	var scores = evalMoves();
	var best;
	for(var n in scores) {
		if(!best || scores[n]>scores[best]) best=n;
	}
	
	if(lastMove && best===helpers.Inverse[lastMove]) {
		numReverse++;
	} else {
		if(numReverse>0) numReverse--;
	}
	
	//remember non-passing moves as "Stay" to avoid getting stuck in dead ends (we resist going backwards)
	if(helpers.passable(helpers.getMoveTile(gameData.board, myHero, best))) {
		lastMove = best;
		lastTargets = targetsByDir[best];
	} else {
		lastMove = "Stay";
		lastTargets = undefined;
	}
	
	lastTurn = gameData.turn;
	
	return best;
}


module.exports = move;
