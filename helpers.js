var gameData;
var unique = 1;

var Directions = {
	Stay: {x:0,y:0},
	North: {x:0,y:-1},
	South: {x:0,y:1},
	West: {x:-1,y:0},
	East: {x:1,y:0}
};

var Inverse = {
	Stay: "Stay",
	North: "South",
	South: "North",
	West: "East",
	East: "West"
};




function addHealth(hero, amount) {
	hero.health += amount;
	if(hero.health<0) hero.dead = true; // we don't go as far as the game itself, which would replace the tile with unoccupied/bones
	if(hero.health>100) hero.health = 100;
}

function performMove(board, hero, direction) {
	var y = hero.distanceFromTop;
	var x = hero.distanceFromLeft;
	var d = Directions[direction];
	if(d && direction!=="Stay") {
		var x2=x+d.x, y2=y+d.y;
		var dest = board.tiles[y2] && board.tiles[y2][x2];
		if(dest) {
			if(passable(dest)) {
				//move the hero
				board.tiles[y][x] = {
					type: "Unoccupied",
					distanceFromTop: y,
					distanceFromLeft: x
				}
				board.tiles[y2][x2] = hero;
				hero.distanceFromTop = y2;
				hero.distanceFromLeft = x2;
			} else if(isAlly(dest, hero)) {
				addHealth(dest, 40);
			} else if(isEnemy(dest, hero)) {
				addHealth(dest, -10);
			} else if(isWell(dest)) {
				addHealth(hero, 30);
			} else if(isMine(dest)) {
				if(!dest.owner || dest.owner.id!==hero.id) {
					if(!dest.owner || dest.owner.team!=hero.team) {
						//TODO subtract from previous owner, but for now just avoid rewarding stealing from own team
						hero.mineCount++; 
					}
					addHealth(hero, -20);
					dest.owner = hero;
				}
			}
		} //else out of bounds
	}
	
	//attack surroundings
	if(!hero.dead) { //could have died taking mine
		var neighbors = getAdjacent(hero, board);
		for(var i=0; i<neighbors.length; i++) {
			var tile = neighbors[i];
			if(isEnemy(tile, hero)) {
				addHealth(tile, -20);
			}
		}
	}
	
	
}



//we only track health, not diamonds or other stats yet
function simulate(gameData, mover) {
	var board = gameData.board;
	var heroes = gameData.heroes;
	var startIndex = gameData.heroTurnIndex;
	
	// make sure there's just one copy
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		if(!h.dead) {
			heroes[i] = board.tiles[h.distanceFromTop][h.distanceFromLeft];
			//if(heroes[i].id!==h.id) throw "wtf id";
		}
	}
	
	do {
		var hero = heroes[gameData.heroTurnIndex];
		
		if(!hero.dead) {
			var move = mover(hero, board);
			
			performMove(board, hero, move)
			
			
		}
		
		gameData.heroTurnIndex++;
		if(gameData.heroTurnIndex>=heroes.length) gameData.heroTurnIndex=0;
	} while(gameData.heroTurnIndex!=startIndex);
}


function validMove(board, hero, direction) {
	if(direction==="Stay") return true; //always valid
	//we consider pointless/null moves to be invalid here
	var y = hero.distanceFromTop;
	var x = hero.distanceFromLeft;
	var d = Directions[direction];
	if(d) {
		var x2=x+d.x, y2=y+d.y;
		var dest = board.tiles[y2] && board.tiles[y2][x2];
		if(!dest) return false;
		if(dest.type==="DiamondMine" && dest.owner && dest.owner.id===hero.id) return false;
		if(isAlly(dest, hero) && dest.health===100) return false;
		if(dest.type==="Impassable") return false;
		return true;
	}
	return false; //on principle
}

function clone(c) { return JSON.parse(JSON.stringify(c)); }

function shuffle(a) {
	var i = a.length;
	while(i>1) {
		var j = Math.floor(Math.random()*i--);
		var t = a[i];
		a[i] = a[j];
		a[j] = t;
	}
}

function inBounds(x, y) {
	var wh = gameData.board.lengthOfSide;
	return x>=0 && y>=0 && x<wh && y<wh;
}

function getAdjacent(tile, board) {
	var tiles = board.tiles;
	var x = tile.distanceFromLeft;
	var y = tile.distanceFromTop;
	
	var ret=[];
	
	// being silly
	var t;
	y>0 && (t = tiles[y-1][x]) && ret.push(t);
	x+1<board.lengthOfSide && (t = tiles[y][x+1]) && ret.push(t);
	y+1<board.lengthOfSide && (t = tiles[y+1][x]) && ret.push(t);
	x>0 && (t = tiles[y][x-1]) && ret.push(t);
	
	return ret;
}

function grave(tile) {
	return (tile.type==="Hero" && tile.dead) || tile.subType==="Bones";
}

function passable(tile) {
	return tile.type==="Unoccupied" || (tile.type==="Hero" && tile.dead);
}

function hittable(tile) {
	return !passable(tile) && tile.type!=="Impassable";
}

// I'd prefer to be consistent with findNearestObjectDirectionAndDistance if preferGraves is false, hence the reverse loop in pathTrace() and the order of directions in getAdjacent()

function pathTrace(dest, board, preferGraves, source) {
	//console.log("backtracing");
	var path = [dest];
	var now = dest.v;
	
	var tile = dest;
	while(tile.distance>0) {
		if(preferGraves) {
			var adjacent = getAdjacent(tile, board);
			var distance = tile.distance-1;
			tile = undefined;
			//console.log(""+distance+", "+adjacent.length);
			for(var i=adjacent.length-1; i>=0; i--) {
				//console.log(i);
				var neighbor = adjacent[i];
				//console.log(JSON.stringify(neighbor));
				if(neighbor.distance!=distance || neighbor.v!==now || (neighbor!==source && !passable(neighbor))) continue;
				
				tile = neighbor;
				if(!preferGraves || grave(tile)) break;
			}
		} else {
			tile = tile.p;
		}
		//if(!tile) throw "wtf3";
		path.push(tile);
	}
	return path.reverse();
}

function direction(srcTile, destTile) {
	var dy = destTile.distanceFromTop - srcTile.distanceFromTop;
	var dx = destTile.distanceFromLeft - srcTile.distanceFromLeft;
	
	if(dx==0 && dy==0) return "Stay";
	if(Math.abs(dx)>Math.abs(dy)) {
		return (dx<0) ? "West" : "East";
	} else {
		return (dy<0) ? "North" : "South";
	}
}

function pathFind(source, board, preferGraves, filter, limit, maxDist) {
	var targets = [];
	var now = unique++;
	
	source = board.tiles[source.distanceFromTop][source.distanceFromLeft]; //correct for duplication in gameData
	
	var queue=[source], next=[];
	source.v = now;
	source.distance = 0;
	
	//console.log("finding");
	for(;;) {
		//console.log(queue.length);
		
		var index=0;
		while(index<queue.length) {
			var tile = queue[index++];
			
			if(hittable(tile) && (!filter || filter(tile, source)) && tile!==source) {
				var path =  pathTrace(tile, board, preferGraves, source);
				targets.push({
					tile: tile,
					path: path,
					dir: direction(source, path[1]),
					distance: tile.distance
				});
				if(limit && targets.length>=limit) return targets;
			}
			
			if(passable(tile) || tile===source) {
				var distance = tile.distance+1;
				if(maxDist && distance>maxDist) return targets;
				
				
				var adjacent = getAdjacent(tile, board);
				
				for(var i=0; i<adjacent.length; i++) {
					var neighbor = adjacent[i];
					
					if(neighbor.v===now) continue;
					neighbor.v = now;
					neighbor.distance = distance;
					
					if(!preferGraves) neighbor.p = tile;
					
					if(preferGraves && grave(neighbor)) {
						//trick to prefer grave paths
						next.unshift(neighbor);
					} else {
						next.push(neighbor);
					}
				}
			}
		}
		if(next.length==0) break;
		queue = next;
		next = [];
	}
	return targets;
}

function findFirst(source, board, filter) {
	return pathFind(source, board, false, filter, 1)[0];
}

function isAlly(other, hero) {
	return other.type==="Hero" && !other.dead && other.team === (hero||gameData.activeHero).team;
}

function isEnemy(other, hero) {
	return other.type==="Hero" && !other.dead && other.team !== (hero||gameData.activeHero).team;
}

function isWeakerEnemy(other, hero) {
	return other.type==="Hero" && !other.dead && other.team !== (hero||gameData.activeHero).team && other.health<hero.health;
}


function isWell(other) {
	return other.type==="HealthWell";
}

function isOtherMine(other, hero) {
	return other.type==="DiamondMine" && (!other.owner || other.owner.team!==hero.team);
}

function isMine(other) {
	return other.type==="DiamondMine";
}

/*
function testPrediction(phs, hs, dossier) {
	for(var i=0; i<phs.length; i++) {
		if(!lastHeroes[i].dead) {
			var ph = phs[i];
			var h = hs[i];
			
			var d = dossier[h.id];

			
			if((!ph.dead != !h.dead) ||
				(!ph.dead && !h.dead && h.health!=ph.health) ||
				ph.distanceFromTop!=h.distanceFromTop ||
				ph.distanceFromLeft!=h.distanceFromLeft
			) {
				d.miss++;
				
				switch(h.name) {
				case "aggressor": //the only bots we hope to predict reliably
				case "priest":
				case "safeDiamondMiner":
					console.log(""+h.id+"/"+h.name+
						" expected "+ph.health+"/"+ph.distanceFromLeft+","+ph.distanceFromTop+
						" got "+h.health+"/"+h.distanceFromLeft+","+h.distanceFromTop+
						" "+(d.hit/(d.hit+d.miss)) + " " + d.type
						);
				}
			} else {
				d.hit++;
			}
			// to track hit/miss rate we need to log who was alive before the prediction
		}
	}
}



function narrate(hero, board, direction) {
	var message = hero.name;
	var dest;
	if(direction==="Stay") {
		message += " stays";
	} else {
		//we consider pointless/null moves to be invalid here
		var y = hero.distanceFromTop;
		var x = hero.distanceFromLeft;
		var d = helpers.Directions[direction];
		if(d) {
			var x2=x+d.x, y2=y+d.y;
			dest = board.tiles[y2] && board.tiles[y2][x2];
			if(dest) {
				switch(dest.type) {
					case "Unoccupied":
						message += " moves " + direction;
						if(dest.subType==="Bones") message += " and digs";
						break;
					case "Impassable":
						message += " smacks tree " + direction;
						break;
					case "DiamondMine":
						message += " takes mine " + direction;
						if(dest.owner) {
							if(dest.owner.team!==hero.team) {
								message += " from enemy "+dest.owner.name;
							} else {
								message += " from ally "+dest.owner.name;
							}
						}
						break;
					case "HealthWell":
						message += " drinks from well " + direction;
						if(hero.health===100) message += " but already full";
						break;
					case "Hero":
						if(dest.dead) {
							message += " raids corpse " + direction;
						} else {
							if(dest.team===hero.team) {
								if(dest.health===100) {
									message += " shakes hands with " + dest.name;
								} else {
									message += " heals " + dest.name;
								}
							} else {
								if(dest.health<=30) {
									message += " kills " + dest.name;
								} else {
									message += " stabs " + dest.name;
								}
							}
							message += " " + direction;
						}
						break;
				}
			} else {
				message += " hits border " + direction;
			}
		} else {
			message += " flails";
		}
	}
	var adjacent = helpers.getAdjacent(hero, board);
	for(var i=0; i<adjacent.length; i++) {
		var neighbor = adjacent[i];
		if(helpers.isEnemy(neighbor)) {
			if(!dest || neighbor!==dest) {
				if(neighbor.health<=20) {
					message += ", kills " + neighbor.name;
				} else {
					message += ", hits " + neighbor.name;
				}
			}
		}
	}
	console.log(message);
}
*/



module.exports = {
	setGameData: function(g) { gameData = g; },
	clone: clone,
	shuffle: shuffle,
	inBounds: inBounds,
	getAdjacent: getAdjacent,
	pathFind: pathFind,
	findFirst: findFirst,
	isAlly: isAlly,
	isEnemy: isEnemy,
	isWeakerEnemy: isWeakerEnemy,
	isWell: isWell,
	isOtherMine: isOtherMine,
	Directions: Directions,
	validMove: validMove,
	simulate: simulate,
	Inverse: Inverse,
	/*narrate: narrate,
	testPrediction: testPrediction,*/
	getAdjacent: getAdjacent
};
