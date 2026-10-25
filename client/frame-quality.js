/** Adaptive GPU/CPU draw budget with hysteresis. Does not alter combat simulation.
 * Excludes slow background tabs and manual reduced-effect setting. Uses cumulative
 * expensive draw frames rather than packet RTT so poor networking is not mistaken
 * for a slow device.
 */
export class FrameQualityGovernor {
  constructor(){this.reset();}
  reset(){this.reduced=false;this.slow=0;this.fast=0;this.nextChange=0;this.samples=0;}
  report(drawMs,frameGapMs,now,{visible=true,manual=false}={}){
    if(!visible||manual||!Number.isFinite(drawMs)||!Number.isFinite(frameGapMs))return false;
    if(frameGapMs>250||frameGapMs<1)return false;
    this.samples++;
    // A single first-paint/map chunk allocation must not trigger a quality switch.
    if(!this.reduced){
      this.slow=drawMs>=19?Math.min(90,this.slow+2):Math.max(0,this.slow-1);
      if(this.slow>=56&&now>=this.nextChange){
        this.reduced=true;this.fast=0;this.nextChange=now+12000;return true;
      }
    }else{
      this.fast=drawMs<=8.5&&frameGapMs<=20?Math.min(520,this.fast+1):Math.max(0,this.fast-3);
      if(this.fast>=400&&now>=this.nextChange){
        this.reduced=false;this.slow=0;this.nextChange=now+18000;return true;
      }
    }
    return false;
  }
}
