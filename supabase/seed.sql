-- Conrad Command Dashboard — seed data.
-- End-in-Mind text is placeholder; the vision sessions replace it.

insert into areas (id, name, end_in_mind, sort_order) values
 ('inbox',      'Inbox',       'Unsorted, Conrad files these', 0),
 ('dash-farms', 'Dash Farms',  'A profitable farm that runs without me', 1),
 ('la-z-boy',   'La-Z-Boy',    'Software that scales or sells', 2),
 ('trakwell',   'Trakwell',    'Its own company one day', 3),
 ('estate',     'Estate',      'The place, restored and lived in', 4),
 ('properties', 'Properties',  'Cash flow steady, refis handled', 5),
 ('personal',   'Personal',    'Room to enjoy the life you built', 6)
on conflict (id) do nothing;

insert into tasks (area_id, title, flag, source) values
 ('estate','Bind the insurance policies','none','seed'),
 ('estate','Pay the back taxes','none','seed'),
 ('estate','Finish the Steuart title process','none','seed'),
 ('estate','Clean up the burn piles','none','seed'),
 ('estate','Call Tyler Pollson about the flooring','none','seed'),
 ('properties','Seven-property refinance plan','red','seed'),
 ('dash-farms','Rent the brush machine, clear blackberries','none','seed'),
 ('dash-farms','Spray and prune the peach trees','none','seed'),
 ('dash-farms','Set gopher traps','none','seed'),
 ('dash-farms','Set up Geofency for the 500-hour log','none','seed'),
 ('la-z-boy','Define the CRM + calendar goal-machine scope','none','seed'),
 ('trakwell','Send Marshall the Apex + Cognos docs','none','seed');
