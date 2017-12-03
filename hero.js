

//var genes = [1.01,1.12,0.86,1.18,1.53,1,1,1];
//var genes = [1.07,1.41,1.22,1.43,2.40,1,0.67,0.83];
//var genes = [1.01, 1.32, 1.16, 1.58, 2.70, 1.00, 0.47, 0.79];
var genes = [1.04, 1.30, 1.12, 1.53, 2.63, 1, 0.48, 0.81];
/*
for(var i=0;i<8;i++) {
	genes[i] = Math.round(genes[i]*(0.9+0.2*Math.random())*100)/100;
}
console.log("genes = ["+genes.join(", ")+"];")*/

var gameData, helpers;
var myHero;

function getTeamScore(heroes, hero) {
	var score=0;
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		if(!h.dead) {
			var s = h.health + genes[6]*50 + genes[7]*30*h.mineCount;
			if(h.id===hero.id) s+=200; //value our life above others
			//if(isNaN(s)) throw "wtf score " + JSON.stringify(h);
			
			score += s * ((h.team===hero.team)?1:-1);
		}
	}
	return score;
}

var dossier;

//tries to classify a hero and guess their next move
function mimic(hero, board) {
	var d = dossier[hero.id];

	var miner = hero.diamondsEarned>0;
	var healer = hero.healthGiven>0;
	if(hero.damageDone%20===10) d.fighter = true; //distinguish direct attacks from indirect
	var fighter = d.fighter;
	var target;
	
	if(!healer && !miner && !fighter) {
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
			} else if(enemy) {
				if(healer) {
					//may heal adjacent allies
					var ally = helpers.findFirst(hero, board, helpers.isAlly);
					if(ally && ally.health<=60) target = ally;
				}
				if(miner) {
					//may chase mine if full health
					if(hero.health===100) target = mine;
				}
				
				if(!target || enemy.distance<target.distance) {
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
		} else { //dead code for now
			d.type = "survivor";
			if(well) 
				target = well;
		}
	}

	
	if(target) return target.dir;
	return "Stay";
}

var predictions = {};
/*var lastHeroes;
var lastPrediction;*/
var allHits=0, allMisses=0;

function evaluate(direction) {
	var game = helpers.clone(gameData);
	
	var mover = function(hero, board) {
		if(hero.id===myHero.id) {
			return direction;
		} else {
			return mimic(hero, board);
		}
	}
	
	//simulate a round of turns
	helpers.simulate(game, mover);
	
	predictions[direction] = game.heroes; 
	
	return getTeamScore(game.heroes, myHero);
}

var lastMove="Stay";

function evalMoves() {
	var scores = {};
	
	/*
		Short range strategy:
		For each direction, we guess how the next round of turns will play out,
		then calculate a team score.
	*/
	for(var dir in helpers.Directions) {
		if(helpers.validMove(gameData.board, myHero, dir)) {
			scores[dir] = evaluate(dir);
			//if(isNaN(scores[dir])) throw "wtf evaluate";
			if(dir==="Stay") scores[dir]-=5*genes[0]; // bias against staying in one place
		}
	}
	
	/*
		Long range strategy:
		Find all reachable targets to offset scores for their respective directions.
	*/
	var targets = helpers.pathFind(myHero, gameData.board, true, function(tile) {
		return helpers.isAlly(tile) || helpers.isEnemy(tile) ||
			helpers.isOtherMine(tile, myHero) || helpers.isWell(tile);
	});
	var diamondBonus = genes[3]*(0.25+gameData.turn/800);
	for(var i=0; i<targets.length; i++) {
		var target = targets[i];
		var tile = target.tile;
		var value = 0;
		if(helpers.isAlly(tile)) {
			value = genes[1]*(100-tile.health);
		} else if(helpers.isEnemy(tile)) {
			value = genes[2]*Math.max(30+myHero.health-tile.health, 0);
		} else if(helpers.isOtherMine(tile, myHero)) {
			value = diamondBonus*Math.max(myHero.health-20, 0);
		} else if(helpers.isWell(tile)) {
			value = genes[4]*(100-myHero.health);
		} else {
			//throw "wtf "+JSON.stringify(target);
		}
		//if(!helpers.Directions[target.dir]) throw "wtf6 "+JSON.stringify(target);
		//if(!target.distance) throw "wtf distance";
		//if(isNaN(value)) throw "wtf value";
		
		if(scores.hasOwnProperty(target.dir)) { // skip if validMove() identified the direction as pointless
			scores[target.dir] += genes[5]*0.1*value/target.distance;
		}
	}
	
	var avoid = helpers.Inverse[lastMove];
	if(scores.hasOwnProperty(avoid)) scores[avoid]-=5*genes[0];  // bias against reversing our last turn
	
	
	return scores;
}





function initDossier() {
	dossier = [];
	var heroes = gameData.heroes;
	for(var i=0; i<heroes.length; i++) {
		dossier[heroes[i].id] = {
			/*hit:0, miss:0,*/ type:"", fighter: false
		};
	}
}

function newGame() {
	//forget things that we're not supposed to remember between games
	//so that it doesn't skew hero-crucible testing
	//console.log("New Game");
	/*lastPrediction = undefined;
	lastHeroes = undefined;*/
	for(var i in dossier) {
		var d = dossier[i];
		d.type = "";
		d.fighter = "";
	}
}

var lastTurn = 0;

function move(g, h) {
	(helpers = h).setGameData(gameData = g); // :p
	myHero = g.activeHero;
	
	if(!dossier) initDossier();
	
	if(gameData.turn<lastTurn) newGame();
	
	/*if(lastPrediction) {
		helpers.testPrediction(lastPrediction, gameData.heroes, dossier);
	}*/
	
	var scores = evalMoves();
	var best;
	for(var n in scores) {
		//if(isNaN(scores[n])) throw "wtf4";
		//if(n==="undefined") throw "wtf5";
		if(!best || scores[n]>scores[best]) best=n;
	}
	
	//if(!best) throw "wtf2";
	
	//console.log(best + ": " + scores[best]);
	
	lastMove = best;
	/*lastPrediction = predictions[best];
	lastHeroes = helpers.clone(gameData.heroes);
	predictions = {}; //free. kinda pointless*/
	
	lastTurn = gameData.turn;
	
	
	//helpers.narrate(myHero, gameData.board, best);
	
	return best;
}










module.exports = move;
