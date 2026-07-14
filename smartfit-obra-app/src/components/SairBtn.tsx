'use client';
import { supabaseBrowser } from '@/lib/supabase/client';
export default function SairBtn() {
  return (
    <button className="mini" style={{background:'transparent',color:'#B9C2CA',borderColor:'#49535D'}}
      onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.href = '/login'; }}>
      Sair
    </button>
  );
}
